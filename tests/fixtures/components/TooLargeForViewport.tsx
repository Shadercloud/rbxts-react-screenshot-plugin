import React from "@rbxts/react";

/** Deliberately far larger than any real Studio viewport, to exercise the too-big-for-viewport error path. */
function TooLargeForViewport() {
	return (
		<frame
			key="Content"
			Size={UDim2.fromOffset(20000, 20000)}
			BackgroundColor3={Color3.fromRGB(30, 33, 40)}
			BorderSizePixel={0}
		/>
	);
}

export = TooLargeForViewport;
