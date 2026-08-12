import { PACKAGE_VERSION } from "../types/version";

/** Creates the dockable plugin status window (start/stop controls + log) and its single toolbar button. */
const MAX_LOG_LINES = 100;

/**
 * A camera icon bundled with Roblox Studio itself (used for the Insert Object menu's Camera entry),
 * referenced via `rbxasset://` so the toolbar button has a real icon with no asset upload or network
 * access required. Internal to the Studio install, not part of any public API - if a future Studio
 * version moves or removes it, the button falls back to Studio's default placeholder icon.
 *
 * Confirmed working live in Studio despite an unrelated "Unable to load plugin icon. Image may have
 * an invalid or unknown format." line that appears in the Output panel on every launch regardless of
 * this icon (still appears even with the toolbar icon left completely blank) - that error belongs to
 * something else entirely, not this button.
 */
const TOOLBAR_ICON = "rbxasset://studio_svg_textures/Shared/InsertableObjects/Dark/Standard/Camera.png";

const GREEN = Color3.fromRGB(87, 201, 108);
const RED = Color3.fromRGB(224, 92, 92);

export interface PluginWindow {
	log: (message: string) => void;
	onEnabledChanged: (listener: (enabled: boolean) => void) => void;
}

function addCorner(instance: Instance, radius: UDim): void {
	const corner = new Instance("UICorner");
	corner.CornerRadius = radius;
	corner.Parent = instance;
}

/** A pill-shaped button with a colored status dot followed by a text label, e.g. a green dot + "Start". */
function createDotButton(parent: Instance, dotColor: Color3, text: string, layoutOrder: number): TextButton {
	const button = new Instance("TextButton");
	button.AutomaticSize = Enum.AutomaticSize.X;
	button.Size = new UDim2(0, 0, 1, 0);
	button.BackgroundColor3 = Color3.fromRGB(42, 42, 48);
	button.BorderSizePixel = 0;
	button.AutoButtonColor = true;
	button.Text = "";
	button.LayoutOrder = layoutOrder;
	button.Parent = parent;
	addCorner(button, new UDim(0, 6));

	const padding = new Instance("UIPadding");
	padding.PaddingLeft = new UDim(0, 10);
	padding.PaddingRight = new UDim(0, 10);
	padding.Parent = button;

	const layout = new Instance("UIListLayout");
	layout.FillDirection = Enum.FillDirection.Horizontal;
	layout.VerticalAlignment = Enum.VerticalAlignment.Center;
	layout.Padding = new UDim(0, 6);
	layout.Parent = button;

	const dot = new Instance("Frame");
	dot.Size = UDim2.fromOffset(10, 10);
	dot.BackgroundColor3 = dotColor;
	dot.BorderSizePixel = 0;
	dot.LayoutOrder = 1;
	dot.Parent = button;
	addCorner(dot, new UDim(1, 0));

	const label = new Instance("TextLabel");
	label.AutomaticSize = Enum.AutomaticSize.X;
	label.Size = new UDim2(0, 0, 1, 0);
	label.BackgroundTransparency = 1;
	label.Font = Enum.Font.SourceSansSemibold;
	label.Text = text;
	label.TextColor3 = Color3.fromRGB(235, 235, 240);
	label.TextSize = 15;
	label.LayoutOrder = 2;
	label.Parent = button;

	return button;
}

/** The status box reporting the plugin's current "Started"/"Stopped" state. */
function createStatusBox(parent: Instance, layoutOrder: number): (running: boolean) => void {
	const box = new Instance("Frame");
	box.AutomaticSize = Enum.AutomaticSize.X;
	box.Size = new UDim2(0, 0, 1, 0);
	box.BorderSizePixel = 0;
	box.LayoutOrder = layoutOrder;
	box.Parent = parent;
	addCorner(box, new UDim(0, 6));

	const padding = new Instance("UIPadding");
	padding.PaddingLeft = new UDim(0, 12);
	padding.PaddingRight = new UDim(0, 12);
	padding.Parent = box;

	const label = new Instance("TextLabel");
	label.AutomaticSize = Enum.AutomaticSize.X;
	label.Size = new UDim2(0, 0, 1, 0);
	label.BackgroundTransparency = 1;
	label.Font = Enum.Font.SourceSansBold;
	label.TextColor3 = Color3.fromRGB(20, 20, 22);
	label.TextSize = 15;
	label.Parent = box;

	return (running: boolean) => {
		box.BackgroundColor3 = running ? GREEN : RED;
		label.Text = running ? "Started" : "Stopped";
	};
}

/** Creates the visible log/control window and its single toolbar toggle button. */
export function createLogWindow(owner: Plugin): PluginWindow {
	const widgetInfo = new DockWidgetPluginGuiInfo(Enum.InitialDockState.Bottom, true, false, 560, 260, 320, 180);
	const widget = owner.CreateDockWidgetPluginGuiAsync("ScreenshotPluginLog", widgetInfo);
	widget.Name = "Screenshot Bridge";

	const background = new Instance("Frame");
	background.Size = UDim2.fromScale(1, 1);
	background.BackgroundColor3 = Color3.fromRGB(24, 24, 28);
	background.BorderSizePixel = 0;
	background.Parent = widget;

	const heading = new Instance("TextLabel");
	heading.Size = new UDim2(1, -16, 0, 32);
	heading.Position = UDim2.fromOffset(8, 4);
	heading.BackgroundTransparency = 1;
	heading.Font = Enum.Font.SourceSansSemibold;
	heading.Text = `HTTP Screenshot Bridge (version ${PACKAGE_VERSION})`;
	heading.TextColor3 = Color3.fromRGB(240, 240, 245);
	heading.TextSize = 18;
	heading.TextXAlignment = Enum.TextXAlignment.Left;
	heading.Parent = background;

	const controls = new Instance("Frame");
	controls.Position = UDim2.fromOffset(8, 38);
	controls.Size = new UDim2(1, -16, 0, 34);
	controls.BackgroundTransparency = 1;
	controls.Parent = background;

	const controlsLayout = new Instance("UIListLayout");
	controlsLayout.FillDirection = Enum.FillDirection.Horizontal;
	controlsLayout.VerticalAlignment = Enum.VerticalAlignment.Center;
	controlsLayout.Padding = new UDim(0, 8);
	controlsLayout.Parent = controls;

	const startButton = createDotButton(controls, GREEN, "Start", 1);
	const stopButton = createDotButton(controls, RED, "Stop", 2);
	const setStatus = createStatusBox(controls, 3);

	const scroll = new Instance("ScrollingFrame");
	scroll.Position = UDim2.fromOffset(8, 80);
	scroll.Size = new UDim2(1, -16, 1, -88);
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y;
	scroll.CanvasSize = new UDim2();
	scroll.BackgroundColor3 = Color3.fromRGB(16, 16, 19);
	scroll.BorderSizePixel = 0;
	scroll.ScrollBarThickness = 6;
	scroll.Parent = background;

	const layout = new Instance("UIListLayout");
	layout.Padding = new UDim(0, 3);
	layout.Parent = scroll;

	const toolbar = owner.CreateToolbar("Screenshot Bridge");
	const windowToggle = toolbar.CreateButton("ToggleScreenshotBridgeWindow", "Show or hide the Screenshot Bridge window", TOOLBAR_ICON, "Screenshot Bridge");
	windowToggle.SetActive(widget.Enabled);
	windowToggle.Click.Connect(() => { widget.Enabled = !widget.Enabled; });
	widget.GetPropertyChangedSignal("Enabled").Connect(() => windowToggle.SetActive(widget.Enabled));

	let enabled = true;
	let enabledListener: ((nextEnabled: boolean) => void) | undefined;
	setStatus(enabled);
	startButton.MouseButton1Click.Connect(() => {
		if (enabled) return;
		enabled = true;
		setStatus(enabled);
		enabledListener?.(enabled);
	});
	stopButton.MouseButton1Click.Connect(() => {
		if (!enabled) return;
		enabled = false;
		setStatus(enabled);
		enabledListener?.(enabled);
	});

	const log = (message: string) => {
		const line = new Instance("TextLabel");
		line.AutomaticSize = Enum.AutomaticSize.Y;
		line.Size = new UDim2(1, -12, 0, 20);
		line.BackgroundTransparency = 1;
		line.Font = Enum.Font.Code;
		line.Text = `[${os.date("%H:%M:%S")}] ${message}`;
		line.TextColor3 = Color3.fromRGB(205, 205, 215);
		line.TextSize = 14;
		line.TextWrapped = true;
		line.TextXAlignment = Enum.TextXAlignment.Left;
		line.Parent = scroll;

		const children = scroll.GetChildren().filter((child) => child.IsA("TextLabel"));
		if (children.size() > MAX_LOG_LINES) children[0].Destroy();
		task.defer(() => { scroll.CanvasPosition = new Vector2(0, math.max(0, layout.AbsoluteContentSize.Y - scroll.AbsoluteWindowSize.Y)); });
	};

	return {
		log,
		onEnabledChanged: (listener) => { enabledListener = listener; },
	};
}
