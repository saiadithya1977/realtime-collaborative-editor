export const selection = {
  anchor: null,
  focus: null,
  active: false
};

export function clearSelection(){
  selection.anchor = null;
  selection.focus = null;
  selection.active = false;
}
