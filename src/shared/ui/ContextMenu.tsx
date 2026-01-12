export type ContextMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
};

export type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onRequestClose: () => void;
};

export default function ContextMenu(props: ContextMenuProps) {
  return (
    <div
      className="tree-context-menu"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      data-tauri-drag-region="false"
      onMouseDown={(event) => event.stopPropagation()}
    >
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tree-context-menu-item${item.danger ? " is-danger" : ""}`}
          disabled={item.disabled}
          data-tauri-drag-region="false"
          onClick={() => {
            props.onSelect(item.id);
            props.onRequestClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
