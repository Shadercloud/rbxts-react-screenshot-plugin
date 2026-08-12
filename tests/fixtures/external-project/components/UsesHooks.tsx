import React, { useState } from "@rbxts/react";

/**
 * Exercises hooks (not just a static render) so a capture of this component can only succeed if
 * the wrapper and this component share the exact same React module instance - a distinct, bundled
 * copy of React inside the screenshot package would fail hook dispatch across the two instances.
 */
function UsesHooks() {
	const [text] = useState("Hooks work");
	return (
		<frame
			key="Content"
			AutomaticSize={Enum.AutomaticSize.XY}
			Size={UDim2.fromOffset(0, 0)}
			BackgroundColor3={Color3.fromRGB(20, 90, 50)}
			BorderSizePixel={0}
		>
			<uilistlayout />
			<uipadding PaddingTop={new UDim(0, 12)} PaddingBottom={new UDim(0, 12)} PaddingLeft={new UDim(0, 12)} PaddingRight={new UDim(0, 12)} />
			<textlabel
				key="Label"
				AutomaticSize={Enum.AutomaticSize.XY}
				Size={UDim2.fromOffset(0, 0)}
				BackgroundTransparency={1}
				Text={text}
				TextColor3={Color3.fromRGB(255, 255, 255)}
				TextSize={24}
				Font={Enum.Font.GothamBold}
			/>
		</frame>
	);
}

export = UsesHooks;
