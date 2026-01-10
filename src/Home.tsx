type HomeProps = {
  hasVault: boolean;
  onSelectVault: () => void;
};

function Home({ hasVault, onSelectVault }: HomeProps) {
  return (
    <section className="home-pane">
      <div className="home-card">
        <div className="home-title">Welcome</div>
        <div className="home-text">
          {hasVault
            ? "Open a markdown file from the sidebar or create a new web tab."
            : "Select a vault to start browsing your markdown files."}
        </div>
        <button type="button" className="primary" onClick={onSelectVault}>
          Select vault
        </button>
      </div>
    </section>
  );
}

export default Home;
