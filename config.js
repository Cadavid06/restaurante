const path = require('path');

module.exports = {
    // Ruta para los archivos públicos (en este caso, la raíz del proyecto)
    publicPath: path.join(__dirname), 

    // Ruta del archivo index.html
    indexPath: path.join(__dirname, 'index.html'),

    // Configuración de la base de datos
    database: {
        host: 'bsnyuud2rfuv84uwirvt-mysql.services.clever-cloud.com',
        user: 'uslnto3osq3bw7kv',
        password: 'tVm9YWljLunFiFivrH2E',
        database: 'bsnyuud2rfuv84uwirvt',
    },

    // Secreto para JWT
    jwtSecret: 'tu_secreto_jwt'
};
