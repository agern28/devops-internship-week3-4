const { createApp, VERSION } = require('./app');

const PORT = process.env.PORT || 8080;
const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`App v${VERSION} listening on port ${PORT}`);
});
