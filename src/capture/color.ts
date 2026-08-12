/** A plain RGB color, each channel 0-255 - matches the shape `roblox-src/marker-constants.ts` exports and `Color3.fromRGB` expects. */
export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

/** Parses a 6-digit hex color (`#RRGGBB` or `RRGGBB`, case-insensitive) into RGB components. */
export function parseHexColor(input: string): RgbColor {
	const hex = input.startsWith("#") ? input.slice(1) : input;
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
		throw new Error(`'${input}' is not a valid hex color - expected 6 hex digits, e.g. '#00FF00'`);
	}
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}
