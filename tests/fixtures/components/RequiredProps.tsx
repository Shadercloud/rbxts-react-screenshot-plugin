import React from "@rbxts/react";

interface RequiredPropsProps {
	text: string;
	disabled: boolean;
}

function RequiredProps(props: RequiredPropsProps) {
	return (
		<frame
			key="Content"
			Size={UDim2.fromOffset(220, 80)}
			BackgroundColor3={props.disabled ? Color3.fromRGB(60, 60, 60) : Color3.fromRGB(99, 102, 241)}
			BorderSizePixel={0}
		>
			<textlabel
				key="Label"
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
				Text={props.text}
				TextColor3={Color3.fromRGB(255, 255, 255)}
				TextSize={18}
				Font={Enum.Font.GothamBold}
			/>
		</frame>
	);
}

export = RequiredProps;
