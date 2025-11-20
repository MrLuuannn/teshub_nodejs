const app = require('./app');
require('dotenv').config()
var port = process.env.PORT;

app.listen(port, function() {
    console.log(`Servidor escuchando en el puerto ${port}`)
})