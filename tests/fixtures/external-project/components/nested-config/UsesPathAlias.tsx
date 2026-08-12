import React from "@rbxts/react";
import { Lib } from "@scope/lib";

function UsesPathAlias() {
	return (
		<frame
			key="Content"
			Size={UDim2.fromOffset(200, 100)}
			BackgroundColor3={Color3.fromRGB(30, 33, 40)}
			BorderSizePixel={0}
		>
			<Lib />
		</frame>
	);
}

export = UsesPathAlias;
