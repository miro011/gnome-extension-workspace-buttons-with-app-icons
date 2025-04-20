# Workspace Buttons With App Icons

Replaces the original workspaces (activities) indicator with buttons. Each button contains the icons of the windows opened in that workspace.

![Preview](preview.png)

## Features

- **Multi Monitor Support**
  - Creates extra topbars for other monitors.
  - Each workspace button contains the only icons for that workspace-monitor combo.

- **Dynamic and Fixed Workspaces Support**

- **Lots of customization options**

- **Window Switcher Improvements**
  - Shows only the windows from the current monitor (and workspace).
  - Windows switcher popup itself appears in the currently focused monitor

- **App Icons Ordering**
  - App icons are ordered by most recently focused.

- **Efficiency**
  - Extension detects small changes (window opened, moved etc.) one at a time, and updates only the affected sub-part of the UI.
  - No use of render loops, and no complete re-calculations and re-draws.

## Actions

- **Mouse Scroll**
  - Just like the original indicator switches workspaces but without the delay.

- **Left Click**
  - Activates workspace that was clicked.
  
- **Right Click:**
  - Opens window switcher menu. Ways to navigate:
    - Double right-click to switch back and forth between the two most recent apps.
    - Scroll to select the window you want, followed by a click anywhere on the screen (outside of the popup) to switch to the last selected app.
    - Click on the window you want to select inside of the popup.
    - Use left and right arrow keys or the regular Alt+Tab/Alt+Shift+Tab keys (Enter or Escape to exit).


## Technical Stuff

- **Wayland Xwayland Delays**
  - The extension uses the window-created event. It fires instantly. With xwayland apps the icon and some other things are not available right away due to lag (base things like windowId are though).
  - If someone knows a better way to solve this, let me know.

- **AltTab Switch Windows Edits**
  - The changes have been done to AltTab switch windows:
    - Show window only from the current monitor
      - This one was easy - all I had to do was override one of the prototypes of AltTab in extension.js
    - Show the AltTab menu itself in the current monitor
      - This is something that I could only solve using a hacky method. I tried overriding prototypes and what not, but it seems like the code responsible for where to display Alt+Tab is somewhere very deep that we may not even have access to.
      - The one thing I found which works was overriding the primary monitor (Main.layoutManager.primaryMonitor = Main.layoutManager.monitors(monitorIndex))
        - This is done in both - renderer.js (on focus change event) and workspace-buttons (on container click event)