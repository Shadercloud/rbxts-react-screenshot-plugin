import React from "@rbxts/react";

/**
 * Mimics a common UI-kit "Button" pattern: sized with Scale (fill-parent) rather than an absolute
 * Offset, and with no AutomaticSize of its own - it expects whoever places it to give it a size.
 * Reproduces a reported bug: capturing this directly (no wrapping frame in user code) fails marker
 * detection, while wrapping it in an explicit AutomaticSize frame first works fine.
 */
function FillParentButton() {
	return (
		<frame
			key="Button"
			Size={UDim2.fromScale(1, 1)}
			BackgroundColor3={Color3.fromRGB(99, 102, 241)}
			BorderSizePixel={0}
		>
			<textlabel
				key="Label"
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
				Text="Click me!"
				TextColor3={Color3.fromRGB(255, 255, 255)}
				TextSize={18}
				Font={Enum.Font.GothamBold}
			/>
		</frame>
	);
}

export = FillParentButton;
