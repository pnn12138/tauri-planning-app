api.registerCommand({
  id: "hello.write",
  title: "Hello Plugin: Write .yourapp/hello.txt",
  async handler() {
    const path = ".yourapp/hello.txt";
    await api.vault.writeFile(path, `Hello from plugin at ${new Date().toISOString()}\n`);
  },
});

