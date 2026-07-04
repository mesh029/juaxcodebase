# Phone UI Practices — Jua X Reference

Design source: [Figma Make — Laundry-app](https://www.figma.com/make/SgiMZojmLP1rUeSWwxMvaI/Laundry-app)

Token implementation lives in `theme/` — import from `theme/index.ts`.

---

## The 10 practices you need

### 1. Safe areas

Use `SafeAreaProvider` at the root and `useChromeInsets()` (or `getBottomInset(insets)`) on screens with bottom chrome.

- Notch at the top: `paddingTop: insets.top` on the root container (do not rely on `SafeAreaView` bottom edge on Android edge-to-edge).
- Tab bar: `paddingBottom: bottomInset` **inside** the tab bar container, same background color as the bar — never a separate white/cream strip.
- `hooks/useChromeInsets.ts` paints the Android window + navigation bar to match `theme.canvas` via `expo-system-ui`.

```tsx
// hooks/useChromeInsets.ts — use in App shell
const { insets, bottomInset } = useChromeInsets({
  backgroundColor: theme.canvas,
  isDark: themeMode === 'dark',
});

// ERTabBar — canvas bg matches Figma TabBar.tsx (primaryFaint, not white sheet)
<ERTabBar bottomInset={bottomInset} ... />
```

### 2. 44pt minimum touch targets

Apple HIG: every button, chip, and icon tap area must be at least 44×44pt.

Use `Touch.minSize` from `theme/spacing.ts`:

```tsx
import { Touch } from '../theme';

<Pressable style={{ minHeight: Touch.minSize, minWidth: Touch.minSize }} />
```

### 3. Type scale mirrors iOS Dynamic Type

Do not invent font sizes. Use the scale in `theme/typography.ts` (`Type`):

| Token | Size | Weight | Line height |
|-------|------|--------|-------------|
| `largeTitle` | 34 | 700 | 41 |
| `title1` | 28 | 700 | 34 |
| `title2` | 22 | 700 | 28 |
| `title3` | 20 | 600 | 25 |
| `headline` | 17 | 600 | 22 |
| `body` | 17 | 400 | 22 |
| `callout` | 16 | 400 | 21 |
| `subhead` | 15 | 400 | 20 |
| `footnote` | 13 | 400 | 18 |
| `caption1` | 12 | 400 | 16 |
| `caption2` | 11 | 400 | 13 |

Users with larger accessibility text expect predictable sizes.

### 4. Springs, not linear easing

- **Sheets and cards:** `withSpring({ damping: 22, stiffness: 280 })` — see `Motion.spring` in `theme/motion.ts`.
- **Colour and opacity:** `Easing.bezier(0.25, 0.46, 0.45, 0.94)` — see `Motion.timing.standard`.
- **Never** `Easing.linear` on user-facing transitions.

### 5. Haptics at the right moments

Wired in `HapticMap` (`theme/motion.ts`):

| Moment | Call |
|--------|------|
| Selection (chip, segment) | `HapticMap.selection()` |
| Booking confirmed | `HapticMap.bookingConfirmed()` |
| Error | `HapticMap.error()` |
| Light tap feedback | `HapticMap.light()` |

**Never** on scroll. **Never** on hover.

### 6. KeyboardAvoidingView on iOS

Without it, the keyboard covers CTAs and inputs. Critical for OTP, name field, and address input.

```tsx
<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
  {/* inputs + CTA */}
</KeyboardAvoidingView>
```

`AuthScreen.tsx` already follows this pattern.

### 7. Bounce on scroll is expected

- iOS: `bounces={true}` (default) — disabling breaks native feel.
- Android only: `overScrollMode="never"` on WebViews/maps where rubber-banding conflicts.

### 8. @gorhom/bottom-sheet, not hand-rolled

Velocity-based snapping, scroll-lock inside sheets, rubber-banding at extremes.

Snap points from `SheetConfig` (`theme/config.ts`):

| State | Fraction |
|-------|----------|
| Collapsed | 0.25 |
| Mid | 0.50 |
| Full | 0.90 |

Grabber: 36×4px (`SheetConfig.grabber`).

### 9. Status bar style per screen

| Screen type | Style | Token |
|-------------|-------|-------|
| Dark auth | `light` | `Colors.auth` screens |
| Light app | `dark` | `Colors.light.statusBar` |
| Dark app | `light` | `Colors.dark.statusBar` |

```tsx
import { StatusBar } from 'expo-status-bar';
<StatusBar style={theme.statusBar} />
```

### 10. Navigation gesture is sacred

`gestureEnabled: true` (React Navigation default). Swipe-left-to-go-back is muscle memory for iPhone users.

Only suppress on modals and bottom-sheet states where it would conflict with horizontal scroll.

---

## Figma MCP → codebase mapping

What Cursor reads from the Figma Make MCP and where it lands in this repo:

| MCP tool / resource | Use | Code location |
|---------------------|-----|---------------|
| `theme://colors` | Light/dark tokens by semantic name | `theme/colors.ts` → `Colors.light` / `Colors.dark` |
| `theme://typography` | Full type scale with lineHeight and letterSpacing | `theme/typography.ts` → `Type` |
| `theme://spacing` | 4pt grid, radius scale, touch targets | `theme/spacing.ts` → `Spacing`, `Radius`, `Touch` |
| `theme://motion` | Spring configs, timing, haptic map | `theme/motion.ts` → `Motion`, `HapticMap` |
| `theme://config` | Map heights, sheet snap points, KES pricing | `theme/config.ts` → `SheetConfig`, `Pricing` |
| `theme://shadows` | iOS shadow + Android elevation | `theme/shadows.ts` → `Shadows` |
| `get_color primary` | `#F5A623` (light and dark) | `Colors.light.primary`, `Colors.dark.primary` |
| `get_type_style headline` | 17 / 600 / lineHeight 22 | `Type.headline` |
| `get_haptic bookingConfirmed` | Success notification | `HapticMap.bookingConfirmed()` |

### Light theme palette (warm gold — not cold gray)

| Token | Value |
|-------|-------|
| `canvas` | `#FFFBF0` |
| `sheet` | `#FFFFFF` |
| `surface` | `#FFF5DC` |
| `border` | `#EFE0C0` |
| `text` | `#1A0F00` |
| `textMuted` | `#A08060` |
| `primary` | `#F5A623` |
| `primaryLight` | `#FFF5DC` |
| `ctaText` | `#1A0F00` (dark on gold buttons) |

### Auth / onboarding (always dark)

| Token | Value |
|-------|-------|
| `auth.background` | `#0A0700` |
| `auth.inputBg` | `#150E00` |
| `auth.inputBorder` | `#2A1800` |

### Import cheat sheet

```ts
import {
  Colors,
  Type,
  FontFamily,
  Spacing,
  Radius,
  Touch,
  Motion,
  HapticMap,
  SheetConfig,
  Shadows,
  BRAND,
  MAKE,
} from './theme';
```

`BRAND` and `MAKE` are backward-compatible aliases — prefer `Colors`, `Type`, etc. for new code.

---

## Quick checklist before shipping a screen

- [ ] Safe area insets applied (top + bottom)
- [ ] All tappables ≥ 44×44pt
- [ ] Font sizes from `Type` scale only
- [ ] Sheet motion uses `Motion.spring.sheet`
- [ ] Haptics on confirm/select, not on scroll
- [ ] `KeyboardAvoidingView` on any screen with text input
- [ ] `StatusBar` matches light/dark context
- [ ] Swipe-back gesture not blocked unless necessary
