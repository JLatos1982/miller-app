export default function AddToHandoutButton({ resource, selected, onAdd, onRemove }) {
  return (
    <button
      type="button"
      className={`add-to-handout-button ${selected ? "is-added" : ""}`}
      aria-pressed={selected}
      onClick={() => selected ? onRemove() : onAdd(resource)}
    >
      <span aria-hidden="true">{selected ? "✓" : "+"}</span>
      {selected ? "Added — remove" : "Add to handout"}
    </button>
  )
}

