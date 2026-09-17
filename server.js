const app = require('./server/server');

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Calzada server listening on port ${PORT}`);
    });
}

module.exports = app;
