import React from "@rbxts/react";

function Nested() {
	return (
		<frame key="Content" Size={UDim2.fromOffset(240, 160)} BackgroundColor3={Color3.fromRGB(20, 22, 28)} BorderSizePixel={0}>
			<textlabel
				key="Title"
				Size={UDim2.fromOffset(200, 32)}
				Position={UDim2.fromOffset(20, 16)}
				BackgroundTransparency={1}
				Text="Nested UI"
				TextColor3={Color3.fromRGB(255, 255, 255)}
				TextSize={20}
				Font={Enum.Font.GothamBold}
			/>
			<frame
				key="Divider"
				Size={UDim2.fromOffset(200, 2)}
				Position={UDim2.fromOffset(20, 56)}
				BackgroundColor3={Color3.fromRGB(80, 80, 90)}
				BorderSizePixel={0}
			/>
		</frame>
	);
}

export = Nested;
