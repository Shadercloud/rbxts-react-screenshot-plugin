import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(data: Buffer): number {
	let crc = 0xffff_ffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
	}
	return (crc ^ 0xffff_ffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const name = Buffer.from(type, "ascii");
	const result = Buffer.allocUnsafe(12 + data.length);
	result.writeUInt32BE(data.length, 0);
	name.copy(result, 4);
	data.copy(result, 8);
	result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
	return result;
}

/** Encodes tightly packed, top-to-bottom RGBA8 pixels as a standards-compliant PNG. */
export function encodeRgba8Png(rgba: Buffer, width: number, height: number): Buffer {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("RGBA8 dimensions must be positive integers");
	if (rgba.length !== width * height * 4) throw new Error(`RGBA8 payload has ${rgba.length} bytes; expected ${width * height * 4}`);

	const scanlines = Buffer.allocUnsafe((width * 4 + 1) * height);
	for (let row = 0; row < height; row += 1) {
		const outputOffset = row * (width * 4 + 1);
		scanlines[outputOffset] = 0;
		rgba.copy(scanlines, outputOffset + 1, row * width * 4, (row + 1) * width * 4);
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]);
}

export interface DecodedPng {
	width: number;
	height: number;
	/** Tightly packed, top-to-bottom RGBA8 pixels. */
	pixels: Buffer;
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	if (pb <= pc) return b;
	return c;
}

/** Decodes a non-interlaced, 8-bit RGB or RGBA PNG (the only formats this pipeline's capture tools produce). */
export function decodePng(buffer: Buffer): DecodedPng {
	if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Not a PNG file");

	let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
	const idatParts: Buffer[] = [];
	let offset = 8;
	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString("ascii", offset + 4, offset + 8);
		const data = buffer.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8];
			colorType = data[9];
			interlace = data[12];
		} else if (type === "IDAT") {
			idatParts.push(Buffer.from(data));
		} else if (type === "IEND") {
			break;
		}
		offset += 12 + length;
	}

	if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
		throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
	}

	const bytesPerPixel = colorType === 6 ? 4 : 3;
	const raw = inflateSync(Buffer.concat(idatParts));
	const stride = width * bytesPerPixel;
	const pixels = Buffer.alloc(width * height * 4);
	const previousScanline = Buffer.alloc(stride);
	let rawOffset = 0;
	for (let y = 0; y < height; y += 1) {
		const filterType = raw[rawOffset];
		const scanline = Buffer.alloc(stride);
		raw.copy(scanline, 0, rawOffset + 1, rawOffset + 1 + stride);
		rawOffset += 1 + stride;

		for (let i = 0; i < stride; i += 1) {
			const x = scanline[i];
			const left = i >= bytesPerPixel ? scanline[i - bytesPerPixel] : 0;
			const up = previousScanline[i];
			const upLeft = i >= bytesPerPixel ? previousScanline[i - bytesPerPixel] : 0;
			let value: number;
			if (filterType === 0) value = x;
			else if (filterType === 1) value = x + left;
			else if (filterType === 2) value = x + up;
			else if (filterType === 3) value = x + Math.floor((left + up) / 2);
			else if (filterType === 4) value = x + paeth(left, up, upLeft);
			else throw new Error(`Unsupported PNG filter type ${filterType}`);
			scanline[i] = value & 0xff;
		}

		for (let px = 0; px < width; px += 1) {
			const srcOffset = px * bytesPerPixel;
			const destOffset = (y * width + px) * 4;
			pixels[destOffset] = scanline[srcOffset];
			pixels[destOffset + 1] = scanline[srcOffset + 1];
			pixels[destOffset + 2] = scanline[srcOffset + 2];
			pixels[destOffset + 3] = bytesPerPixel === 4 ? scanline[srcOffset + 3] : 255;
		}
		scanline.copy(previousScanline);
	}

	return { width, height, pixels };
}
