# Terminal Resize Handling

## Overview

The blackboard TUI implements debounced terminal resize handling to provide smooth, performant resizing behavior without excessive re-renders.

## How Resize Events Work

### Event Source

Terminal resize events come from different sources depending on the platform:

- **Unix/Linux/macOS**: The OS sends a `SIGWINCH` (window change) signal whenever the terminal size changes
- **Windows**: deno_tui polls for size changes at the refresh rate (60 FPS by default)

### Event Frequency

During a manual terminal resize (dragging the window edge), resize events can fire:

- **Continuously** on Unix systems (multiple events per second during drag)
- **Every ~16ms** on Windows (at 60 FPS refresh rate)

This means without debouncing, the resize handler could execute dozens or hundreds of times during a single resize operation.

## Implementation

### Why Debouncing is Necessary

The `handleResize()` function performs expensive operations:

1. **Cleanup**: Destroys all existing UI components for the active tab
2. **Recreation**: Creates new Box and Text objects with updated dimensions
3. **Signal setup**: Establishes new reactive subscriptions
4. **Initial render**: Draws all components to the canvas

Performing these operations on every resize event during a drag would:

- Cause visible flickering as components are destroyed/recreated
- Waste CPU cycles on intermediate sizes that the user never sees
- Potentially drop input events due to excessive rendering load

### Debounce Configuration

The resize handler is debounced with a **250ms delay**:

```typescript
const debouncedHandleResize = debounce(handleResize, { delayMs: 250 });
```

This configuration means:

- **During resize**: Each new resize event resets the 250ms timer
- **After resize**: Once the user stops resizing, we wait 250ms then rebuild components
- **Result**: Components are rebuilt once per resize operation, not dozens of times

### Delay Selection Rationale

The 250ms delay was chosen because:

1. **Responsive enough**: Quarter-second feels instant to users
2. **Debounces effectively**: Most resize drags last >250ms, so we avoid rebuilding during the operation
3. **Industry standard**: Common debounce delay for resize events in web applications (200-300ms)

### Alternative Approaches Considered

#### No Debouncing
- **Pros**: Immediate visual feedback
- **Cons**: Flickering, performance issues, poor UX during rapid resizes
- **Verdict**: Rejected due to poor performance

#### Longer Delay (500ms+)
- **Pros**: More aggressive debouncing
- **Cons**: Feels sluggish, users notice the delay
- **Verdict**: Rejected as too slow

#### Throttling Instead of Debouncing
- **Pros**: Guaranteed maximum update frequency (e.g., once per 250ms)
- **Cons**: Still rebuilds components during resize, just less frequently
- **Verdict**: Rejected because we want zero rebuilds during the operation

#### Leading Edge Execution
- **Pros**: Immediate first resize response
- **Cons**: Causes one rebuild at start of drag, then another at end
- **Verdict**: Rejected to minimize total rebuilds

## Cleanup

The debounced function is properly cleaned up on TUI exit:

```typescript
debouncedHandleResize.cancel();
```

This ensures no pending resize operations execute after the TUI has been destroyed.

## Testing

The debounce utility includes comprehensive unit tests covering:

- Basic debouncing behavior
- Timer restart on new calls
- Cancellation
- Leading edge execution
- Argument passing

Run tests with:

```bash
deno test blackboard/cli/src/tui/utils/debounce.test.ts
```

## Future Improvements

If resize performance becomes an issue even with debouncing, consider:

1. **Incremental resize**: Update component dimensions without full recreation
2. **Virtual scrolling**: Only render visible items in long lists
3. **Canvas optimization**: Use deno_tui's built-in resize handling for individual components
4. **Adaptive debouncing**: Longer delay for low-end systems, shorter for high-end

However, the current implementation should handle typical usage well.
