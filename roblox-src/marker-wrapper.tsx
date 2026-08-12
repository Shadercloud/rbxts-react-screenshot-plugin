import React from "@rbxts/react";

import { MARKER_COLOR, MARKER_THICKNESS } from "./marker-constants";

interface MarkerWrapperProps {
	children?: React.Element;
}

/** Wraps the captured component in a solid marker-color frame; the padded inner frame's background shows through as a continuous border. */
function MarkerWrapper(props: MarkerWrapperProps) {
	return (
		<frame
			key="ScreenshotMarker"
			AutomaticSize={Enum.AutomaticSize.XY}
			Size={UDim2.fromOffset(0, 0)}
			BackgroundColor3={Color3.fromRGB(MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b)}
			BorderSizePixel={0}
		>
			<uipadding
				PaddingTop={new UDim(0, MARKER_THICKNESS)}
				PaddingBottom={new UDim(0, MARKER_THICKNESS)}
				PaddingLeft={new UDim(0, MARKER_THICKNESS)}
				PaddingRight={new UDim(0, MARKER_THICKNESS)}
			/>
			<uilistlayout />
			<frame
				key="ScreenshotContent"
				AutomaticSize={Enum.AutomaticSize.XY}
				Size={UDim2.fromOffset(0, 0)}
				BackgroundTransparency={1}
				BorderSizePixel={0}
			>
				{props.children}
			</frame>
		</frame>
	);
}

export = MarkerWrapper;
