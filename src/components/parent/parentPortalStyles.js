// Shared style fragments for the parent portal components.

export const NUNITO = '"Nunito", sans-serif';

export const sectionTitleSx = {
  fontWeight: 700,
  color: 'parent.accent',
  fontFamily: NUNITO,
};

// Tappable cards render as real <button> elements so they work for keyboard
// and screen-reader users; these resets undo the native button styling.
export const tappableCardSx = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  font: 'inherit',
  appearance: 'none',
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'parent.accentHover',
    outlineOffset: 2,
  },
};
