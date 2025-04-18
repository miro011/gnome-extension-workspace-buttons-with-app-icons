# Workspace Buttons With App Icons

Removes the original workspaces (activities) indicator and replaces it with buttons. Within each button are the icons of the windows opened in that workspace. It also moves the clock to the right to free up space if needed.

![Preview](preview.png)

## Features

- **App Icons Ordering**
  - App icons are ordered based on most recently used (same order as the Alt+Tab switch window menu).
  - Note: When you first enable the extension and you already have windows opened, the order may not reflect this because it won't know the order yet. Once you start switching between them, it will arrange them properly.

- **Efficiency**
  - Instead of constantly recalculating everything, this extension exclusively detects small changes (window opened, closed, moved etc.) one at a time, and updates only the affected sub-part of the UI. This avoids unnecessary computation and boosts performance significantly.

- **Scroll (anywhere within the container):**
  - Switch workspace (up = left / down = right).
  
- **Middle Click:**
  - Open overview for that workspace.

- **Left Click:**
  - Switch to whichever workspace was clicked.

- **Right Click:**
  - Opens the Alt+Tab window switcher popup for that workspace (switches to it first if not active).
  - Ways to navigate:
    - **Mouse Only:**
      - Double right-click to switch back and forth between the two most recent apps (same as pressing Alt+Tab repeatedly).
      - Scroll to select the window you want, followed by a click anywhere on the screen (outside of the popup) to switch to the last selected app.
      - Click the window you want to select inside of the popup.
    - **Keyboard Only:**
      - Use left and right arrow keys or the regular Alt+Tab/Alt+Shift+Tab keys (Enter or Escape to exit).

## Technical Stuff

- **Wayland Xwayland Delays**
  - The extension uses the window-created event. It fires instantly. The app objects of apps running under xwayland are not instantly populated. That's why a delay is introduced. This is also the only time we ever need to worry about this.
  - The delay can be configured through the setting wsb-generate-window-icon-timeout. It affects two things:
    - How long before the icon is generated (which is what I called this setting to be user friendly)
    - How long until the app is re-checked after creation (When the window-created event fires and window passes the checks, it is added, but after this delay, it is recked. If it fails the checks, it is removed.)
      - For example an invalid window running under xwayland is opened (invalid being a window that would not be listed in AltTab), it is initially added to the container, but after that short delay (when it has supposed to have populated), it is rechecked (if it still exists) and if it fails the check (which it will), it gets taken out.
  - The implementation of this in in both renderer.js (the recheck) and workspace-buttons.js (the icon generation)
  - If someone knows a better way to solve this without waiting a fixed amount of time, and instead, the update being triggered by itself when the window object updates let me know (it defiantly sounds like something that should be possible, but I'll have to check)

- **AltTab Switch Windows Edits**
  - The changes have been done to AltTab switch windows:
    - Show window only from the current monitor
      - This one was easy - all I had to do was override one of the prototypes of AltTab in extension.js
    - Show the AltTab menu itself in the current monitor
      - This is something that I couldn't solve normally. I tried overriding prototypes and what not, but it seems like the code responsible for where to display Alt+Tab is somewhere very deep that we may not even have access to.
      - The one thing I found which works was overriding the primary monitor (Main.layoutManager.primaryMonitor = Main.layoutManager.monitors(monitorIndex))
        - This is done in both - renderer.js (on focus change event) and workspace-buttons (on container click event)