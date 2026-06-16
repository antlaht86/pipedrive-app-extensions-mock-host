// Loaded inside an iframe by OPEN_MODAL custom_modal (config.customModals).
export default function CustomModalContent() {
  return (
    <div style={{ padding: 22 }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.25em',
          color: '#34e08a',
          margin: 0,
        }}
      >
        CUSTOM MODAL
      </p>
      <h3 style={{ margin: '8px 0 6px', fontSize: 18 }}>Custom modal content</h3>
      <p style={{ color: '#76859b', margin: 0, fontSize: 13 }}>
        This Next route is loaded in an iframe by the Mock Host&apos;s custom
        modal.
      </p>
    </div>
  );
}
