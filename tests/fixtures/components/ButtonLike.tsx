import React from "@rbxts/react";

/**
 * Mimics the DOM shape a polished UI-kit "Button" component tends to render (traced from
 * `@rbxts/react-clean-ui`'s actual `Button.tsx` source, not imported - avoids a real dependency on
 * that package): an `AutomaticSize`-XY root sized `Offset(0, 0)`, with `UICorner`/`UIStroke`/
 * `UIPadding` decorators, a horizontal `UIListLayout`, and a single `AutomaticSize`-XY `TextLabel`
 * child sized `Scale(0, 0)`. Reproduces a reported bug: capturing this directly (no wrapping frame
 * in user code) throws "The marker border is incomplete, non-rectangular, or ambiguous", while
 * wrapping it in an explicit `AutomaticSize` frame first works fine.
 */
function ButtonLike() {
	return (
		<frame
			key="Button"
			Size={UDim2.fromOffset(0, 0)}
			AutomaticSize={Enum.AutomaticSize.XY}
			BackgroundColor3={Color3.fromRGB(99, 102, 241)}
			BorderSizePixel={0}
		>
			<uicorner CornerRadius={new UDim(0, 8)} />
			<uistroke Thickness={1} Color={Color3.fromRGB(129, 132, 255)} />
			<uipadding
				PaddingTop={new UDim(0, 8)}
				PaddingBottom={new UDim(0, 8)}
				PaddingLeft={new UDim(0, 16)}
				PaddingRight={new UDim(0, 16)}
			/>
			<uilistlayout FillDirection={Enum.FillDirection.Horizontal} VerticalAlignment={Enum.VerticalAlignment.Center} />
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

export = ButtonLike;
