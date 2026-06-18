/**
 * Surface helpers (CONTEXT.md "Surface"). The per-type RESIZE bounds and the
 * resolve/validate/apply logic the host enforces, factored into one internal
 * module so the host-effects' `surface` group and the host both speak the same
 * rules. Behaviour matches Pipedrive: an out-of-bounds dimension is rejected
 * (nothing applied), not clamped (ADR-0006, superseded section).
 */

// Per-type RESIZE bounds [min, max] in px (ADR-0006). Panel width is fixed
// (min === max), so RESIZE can never change it. Types are added here as their
// wrappers land; the surface selector and size validation derive from these keys.
export const SURFACE_BOUNDS: Record<
  string,
  { width: [number, number]; height: [number, number] }
> = {
  'pd-mock-panel': { width: [385, 385], height: [100, 750] },
  'pd-mock-modal': { width: [320, Infinity], height: [120, Infinity] },
  'pd-mock-floating-window': { width: [200, 800], height: [70, 700] },
};

// A surface is identified by class (`pd-mock-panel`) OR id (`id="pd-mock-panel"`).
// The id form gets the same behaviour without the class-based host styles.
const SURFACE_SELECTOR = Object.keys(SURFACE_BOUNDS)
  .map((cls) => `.${cls}, #${cls}`)
  .join(', ');

const outOfRange = (value: number, min: number, max: number): boolean =>
  value < min || value > max;

// A modal's max is the live viewport: bounds use Infinity, resolved here.
const resolveMax = (max: number, viewport: number): number =>
  max === Infinity ? viewport : max;

// Human-readable surface name for diagnostics, e.g. 'pd-mock-panel' → 'panel'.
export const surfaceName = (cls: string): string =>
  cls.replace(/^pd-mock-/, '');

// The bounds key (class) for an element, or undefined if it is not a surface.
export const surfaceTypeOf = (el: HTMLElement): string | undefined =>
  Object.keys(SURFACE_BOUNDS).find(
    (cls) => el.classList.contains(cls) || el.id === cls,
  );

// Where the App Extension renders. Auto-detect the first surface wrapper; fall
// back to the document body.
export const resolveSurface = (): HTMLElement =>
  document.querySelector<HTMLElement>(SURFACE_SELECTOR) ?? document.body;

// Apply a size to the current surface. Each requested dimension must fall within
// the surface type's bounds; if any is out of range the whole resize is rejected
// (nothing applied) and a console error explains why — mirroring real Pipedrive,
// which ignores an out-of-bounds size. Shared by RESIZE and the initial size from
// initialize(). `context` names the caller for the error message. Returns whether
// the size was applied.
export const applySize = (
  size: { width?: number; height?: number } | undefined,
  context: string,
): boolean => {
  if (!size) {
    return true;
  }
  const surface = resolveSurface();
  const type = surfaceTypeOf(surface);
  const bounds = type ? SURFACE_BOUNDS[type] : undefined;
  // Unknown surface (body fallback): no bounds to enforce, apply as-is.
  if (!bounds) {
    if (size.width != null) surface.style.width = `${size.width}px`;
    if (size.height != null) surface.style.height = `${size.height}px`;
    return true;
  }

  // Panel width is fixed (min === max), so the dimension is not resizable — a
  // requested width is ignored rather than treated as out of range.
  const widthFixed = bounds.width[0] === bounds.width[1];
  const widthMax = resolveMax(bounds.width[1], window.innerWidth);
  const heightMax = resolveMax(bounds.height[1], window.innerHeight);
  const errors: string[] = [];
  if (
    size.width != null &&
    !widthFixed &&
    outOfRange(size.width, bounds.width[0], widthMax)
  ) {
    errors.push(
      `width ${size.width}px is outside ${bounds.width[0]}–${widthMax}px`,
    );
  }
  if (
    size.height != null &&
    outOfRange(size.height, bounds.height[0], heightMax)
  ) {
    errors.push(
      `height ${size.height}px is outside ${bounds.height[0]}–${heightMax}px`,
    );
  }
  if (errors.length > 0) {
    console.error(
      `[pipedrive-mock-host] ${context} rejected: ${errors.join('; ')} for the ${surfaceName(type!)} surface.`,
    );
    return false;
  }

  if (size.width != null && !widthFixed)
    surface.style.width = `${size.width}px`;
  if (size.height != null) surface.style.height = `${size.height}px`;
  return true;
};
