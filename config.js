const path = require('path');

module.exports = {
    // Ruta para los archivos públicos (en este caso, la raíz del proyecto)
    publicPath: path.join(__dirname), 

    // Ruta del archivo index.html
    indexPath: path.join(__dirname, 'index.html')
};
