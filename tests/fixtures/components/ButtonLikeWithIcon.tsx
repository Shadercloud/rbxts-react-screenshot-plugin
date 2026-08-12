import React from "@rbxts/react";

/**
 * Extends ButtonLike.tsx's repro with a second sibling inside the horizontal UIListLayout - a
 * fixed-size icon `ImageLabel` next to the `AutomaticSize` text label - and a larger UICorner
 * radius, matching a reported follow-up bug (`<Button icon="adjust" text="Click me!" />` wrapped in
 * a `ThemeProvider` with an extended `cornerRadius`). `ThemeProvider` itself renders only a React
 * Context.Provider (confirmed from source) and creates no Roblox instance, so it's deliberately
 * omitted here - this isolates whether the icon sibling and/or larger corner radius are the actual
 * trigger, independent of the Provider.
 */
function ButtonLikeWithIcon() {
	return (
		<frame
			key="Button"
			Size={UDim2.fromOffset(0, 0)}
			AutomaticSize={Enum.AutomaticSize.XY}
			BackgroundColor3={Color3.fromRGB(99, 102, 241)}
			BorderSizePixel={0}
		>
			<uicorner CornerRadius={new UDim(0, 20)} />
			<uistroke Thickness={1} Color={Color3.fromRGB(129, 132, 255)} />
			<uipadding
				PaddingTop={new UDim(0, 8)}
				PaddingBottom={new UDim(0, 8)}
				PaddingLeft={new UDim(0, 16)}
				PaddingRight={new UDim(0, 16)}
			/>
			<uilistlayout FillDirection={Enum.FillDirection.Horizontal} VerticalAlignment={Enum.VerticalAlignment.Center} Padding={new UDim(0, 6)} />
			<frame
				key="Icon"
				Size={UDim2.fromOffset(20, 20)}
				BackgroundColor3={Color3.fromRGB(255, 255, 255)}
				BorderSizePixel={0}
			/>
			<textlabel
				key="Label"
				Size={UDim2.fromScale(0, 0)}
				AutomaticSize={Enum.AutomaticSize.XY}
				BackgroundTransparency={1}
				Text="Click me!"
				TextColor3={Color3.fromRGB(255, 255, 255)}
				TextSize={18}
				Font={Enum.Font.GothamBold}
			/>
		</frame>
	);
}

export = ButtonLikeWithIcon;
