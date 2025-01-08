const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const config = require('./config');
const PDFDocument = require('pdfkit');
require('dotenv').config({
    path: process.env.NODE_ENV === 'production' ? '.env' : '.envLocal'
});

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(config.publicPath));

// Configuración del pool de conexiones a la base de datos
const poolConfig = process.env.NODE_ENV === 'production'
    ? {
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,   
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
        port: process.env.MYSQLPORT,
        ssl: { rejectUnauthorized: false },
        connectionLimit: 10
    }
    : {
        host: 'bsnyuud2rfuv84uwirvt-mysql.services.clever-cloud.com',
        user: 'uslnto3osq3bw7kv',
        password: 'tVm9YWljLunFiFivrH2E',
        database: 'bsnyuud2rfuv84uwirvt',
        port: 3306,
        connectionLimit: 10
    };

const pool = mysql.createPool(poolConfig);

// Promisify for Node.js async/await.
const promisePool = pool.promise();

// Test database connection
async function testDbConnection() {
    try {
        const [rows] = await promisePool.query('SELECT 1');
        console.log('Database connection successful');
    } catch (error) {
        console.error('Error connecting to the database:', error);
    }
}

testDbConnection();

// Middleware de autenticación
function authenticateToken(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ authenticated: false, message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt', (err, user) => {
        if (err) {
            return res.status(403).json({ authenticated: false, message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// Servir todos los archivos estáticos desde el directorio raíz
app.use(express.static(path.join(__dirname)));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/isAuthenticated', authenticateToken, (req, res) => {
    res.json({ authenticated: true, user: req.user });
});  

// Rutas protegidas
const protectedPages = [
    'agg_products.html',
    'consultas.html',
    'gestion_admin.html',
    'gestion_pedidos.html',
    'gestion_usuarios.html',
    'menu.html'
];

protectedPages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(__dirname, page));
    });
});

// Ruta para crear usuarios
app.post('/crearUsuario', async (req, res) => {
    const { email, password, role } = req.body;
    console.log('Datos recibidos:', { email, role });

    const checkUserQuery = `
        SELECT 'administrador' as role FROM administrador WHERE nombre = ?
        UNION ALL
        SELECT 'empleado' as role FROM empleado WHERE nombre = ?
    `;
    try {
        const [results] = await promisePool.query(checkUserQuery, [email, email]);
        if (results.length > 0) {
            console.log('Usuario ya existe:', email);
            return res.status(400).json({ success: false, message: 'El correo electrónico ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = role === 'administrador'
            ? 'INSERT INTO administrador (nombre, contraseña) VALUES (?, ?)'
            : 'INSERT INTO empleado (nombre, contraseña) VALUES (?, ?)';
        
        await promisePool.query(insertQuery, [email, hashedPassword]);
        console.log('Usuario creado exitosamente:', email);
        res.status(201).json({ success: true, message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ success: false, message: 'Error al crear el usuario' });
    }
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const query = `
        SELECT 'administrador' as role, idAdmin as id, nombre, contraseña FROM administrador WHERE nombre = ?
        UNION ALL
        SELECT 'empleado' as role, idEmpleado as id, nombre, contraseña FROM empleado WHERE nombre = ?
    `;
    try {
        const [results] = await promisePool.query(query, [email, email]);
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Correo electrónico o contraseña incorrectos' });
        }

        const user = results[0];
        const validPassword = await bcrypt.compare(password, user.contraseña);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Correo electrónico o contraseña incorrectos' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'tu_secreto_jwt', { expiresIn: '1h' });

        res.cookie('token', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 3600000 // 1 hora
        });

        res.json({
            success: true,
            role: user.role
        });
    } catch (error) {
        console.error('Error en la base de datos durante el login:', error);
        res.status(500).json({ success: false, message: 'Error en la base de datos' });
    }
});

// Ruta para cerrar sesión
app.post('/logout', (req, res) => {
    res.clearCookie('token', { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: 'strict'
    });
    res.json({ success: true, message: 'Logged out successfully' });
});

// Ruta para agregar una categoría
app.post('/categoria', async (req, res) => {
    const { nombre_cat } = req.body;
    const query = 'INSERT INTO categoria (nombre_categoria) VALUES (?)';
    try {
        const [result] = await promisePool.query(query, [nombre_cat]);
        res.status(201).json({ id: result.insertId, nombre_categoria: nombre_cat });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para obtener todas las categorías
app.get('/categorias', async (req, res) => {
    try {
        const [results] = await promisePool.query('SELECT * FROM categoria');
        console.log('Categorías obtenidas:', results);
        res.status(200).json(results);
    } catch (err) {
        console.error('Error al obtener categorías:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ruta para agregar un producto
app.post('/producto', async (req, res) => {
    console.log('Datos recibidos para agregar producto:', req.body);
    const { idCategoria, descripcion, precio, idAdmin } = req.body;

    if (isNaN(precio)) {
        console.error('Precio no válido:', precio);
        return res.status(400).send('Precio no válido');
    }

    if (!idAdmin) {
        return res.status(400).send('idAdmin es requerido');
    }

    const queryInsertProducto = 'INSERT INTO producto (idCategoria, descripcion, precio, idAdmin) VALUES (?, ?, ?, ?)';
    
    try {
        const [result] = await promisePool.query(queryInsertProducto, [idCategoria, descripcion, precio, idAdmin]);
        const idProducto = result.insertId;
        res.status(201).json({ 
            message: 'Producto agregado exitosamente',
            idProducto, 
            idCategoria,  
            descripcion, 
            precio, 
            idAdmin 
        });
    } catch (err) {
        console.error('Error al agregar producto:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ruta para obtener todos los productos con su categoría
app.get('/productos', async (req, res) => {
    const query = `
        SELECT c.nombre_categoria, p.idProducto, p.descripcion, p.precio
        FROM producto p
        JOIN categoria c ON p.idCategoria = c.idCategoria
    `;
    try {
        const [results] = await promisePool.query(query);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para guardar pedido y detallepedido
app.post('/pedido', async (req, res) => {
    const { idEmpleado, productos } = req.body;
    const fechaPedido = new Date();

    console.log("Iniciando inserción de pedido:", { idEmpleado, productos });

    const productosValidos = productos.filter(p => p.idProducto && !isNaN(p.idProducto));
    if (productosValidos.length !== productos.length) {
        return res.status(400).json({ success: false, error: 'Algunos productos no tienen un ID válido' });
    }

    const pedidoQuery = 'INSERT INTO pedido (fechaPedido, idEmpleado) VALUES (?, ?)';
    
    try {
        const connection = await promisePool.getConnection();
        await connection.beginTransaction();

        try {
            const [result] = await connection.query(pedidoQuery, [fechaPedido, idEmpleado]);
            const idPedido = result.insertId;
            console.log("Pedido insertado con ID:", idPedido);

            const detalleQuery = 'INSERT INTO detallepedido (idPedido, idProducto, cantidad) VALUES (?, ?, ?)';
            for (const producto of productosValidos) {
                await connection.query(detalleQuery, [idPedido, producto.idProducto, producto.cantidad]);
                console.log("Producto insertado en detallepedido:", producto);
            }

            await connection.commit();
            res.status(201).json({ success: true, idPedido });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Error en la inserción del pedido:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener todos los usuarios
app.get('/usuarios', async (req, res) => {
    const query = `
        SELECT idEmpleado as id, nombre, 'empleado' as role FROM empleado
        UNION ALL
        SELECT idAdmin as id, nombre, 'administrador' as role FROM administrador
    `;
    try {
        const [results] = await promisePool.query(query);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener un usuario específico
app.get('/usuario/:id', async (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT idEmpleado as id, nombre, 'empleado' as role FROM empleado WHERE idEmpleado = ?
        UNION ALL
        SELECT idAdmin as id, nombre, 'administrador' as role FROM administrador WHERE idAdmin = ?
    `;
    try {
        const [results] = await promisePool.query(query, [id, id]);
        if (results.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un usuario
app.put('/usuario/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, password, role } = req.body;
    const oldTable = role === 'administrador' ? 'empleado' : 'administrador';
    const newTable = role === 'administrador' ? 'administrador' : 'empleado';
    const idField = role === 'administrador' ? 'idAdmin' : 'idEmpleado';
    
    let query = `UPDATE ${newTable} SET nombre = ?`;
    let params = [nombre];
    if (password) {
        query += ', contraseña = ?';
        params.push(password);
    }
    query += ` WHERE ${idField} = ?`;
    params.push(id);

    try {
        const [result] = await promisePool.query(query, params);
        if (result.affectedRows === 0) {
            const moveQuery = `INSERT INTO ${newTable} (nombre, contraseña) 
                               SELECT nombre, contraseña FROM ${oldTable} WHERE ${oldTable === 'empleado' ? 'idEmpleado' : 'idAdmin'} = ?`;
            const [moveResult] = await promisePool.query(moveQuery, [id]);
            if (moveResult.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }
            await promisePool.query(`DELETE FROM ${oldTable} WHERE ${oldTable === 'empleado' ? 'idEmpleado' : 'idAdmin'} = ?`, [id]);
            res.json({ message: 'Usuario actualizado y movido exitosamente' });
        } else {
            res.json({ message: 'Usuario actualizado exitosamente' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para eliminar un usuario
app.delete('/usuario/:id', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    
    try {
        let result;
        
        if (role === 'empleado') {
            // Solo eliminamos de la tabla empleado
            [result] = await promisePool.query('DELETE FROM empleado WHERE idEmpleado = ?', [id]);
        } else if (role === 'administrador') {
            // Solo eliminamos de la tabla administrador
            [result] = await promisePool.query('DELETE FROM administrador WHERE idAdmin = ?', [id]);
        } else {
            return res.status(400).json({ error: 'Rol no válido' });
        }

        // Verificamos si se eliminó el registro
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ message: 'Usuario eliminado exitosamente' });
    } catch (err) {
        console.error("Error al eliminar usuario:", err);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

// Obtener todas las categorías
app.get('/categorias', async (req, res) => {
    try {
        const [results] = await promisePool.query('SELECT idCategoria as id, nombre_categoria as nombre FROM categoria');
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener una categoría específica
app.get('/categoria/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [results] = await promisePool.query('SELECT idCategoria as id, nombre_categoria as nombre FROM categoria WHERE idCategoria = ?', [id]);
        if (results.length === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar una categoría
app.put('/categoria/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_categoria } = req.body;

    try {
        const [result] = await promisePool.query('UPDATE categoria SET nombre_categoria = ? WHERE idCategoria = ?', [nombre_categoria, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }
        res.json({ message: 'Categoría actualizada exitosamente' });
    } catch (err) {
        console.error("Error al actualizar categoría:", err);
        res.status(500).json({ error: 'Error al actualizar categoría' });
    }
});

// Eliminar una categoría
app.delete('/categoria/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const [result] = await promisePool.query('DELETE FROM categoria WHERE idCategoria = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }
        res.json({ message: 'Categoría eliminada exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener todos los productos
app.get('/productos', async (req, res) => {
    try {
        const [results] = await promisePool.query('SELECT idProducto as id, descripcion, precio, idCategoria FROM producto');
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener un producto específico
app.get('/producto/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [results] = await promisePool.query('SELECT idProducto as id, descripcion, precio, idCategoria FROM producto WHERE idProducto = ?', [id]);
        if (results.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para actualizar un producto
app.put('/producto/:id', async (req, res) => {
    const { id } = req.params;
    const { descripcion, precio, idCategoria } = req.body;
    try {
        const [result] = await promisePool.query('UPDATE producto SET descripcion = ?, precio = ?, idCategoria = ? WHERE idProducto = ?', [descripcion, precio, idCategoria, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto actualizado exitosamente' });
    } catch (err) {
        console.error('Error al actualizar producto:', err);
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

// Ruta para eliminar un producto
app.delete('/producto/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await promisePool.query('DELETE FROM producto WHERE idProducto = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (err) {
        console.error('Error al eliminar producto:', err);
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

// Obtener todos los pedidos
app.get('/pedidos', async (req, res) => {
    try {
        const [results] = await promisePool.query('SELECT * FROM pedido');
        res.json(results);
    } catch (error) {
        console.error('Error fetching pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un pedido específico con sus productos
app.get('/pedido/:id', async (req, res) => {
    const idPedido = req.params.id;
    const query = `
        SELECT p.*, dp.idProducto, dp.cantidad, pr.descripcion
        FROM pedido p
        JOIN detallepedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE p.idPedido = ?
    `;
    try {
        const [results] = await promisePool.query(query, [idPedido]);
        if (results.length === 0) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }
        const pedido = {
            idPedido: results[0].idPedido,
            fechaPedido: results[0].fechaPedido,
            idEmpleado: results[0].idEmpleado,
            productos: results.map(row => ({
                idProducto: row.idProducto,
                descripcion: row.descripcion,
                cantidad: row.cantidad
            }))
        };
        res.json(pedido);
    } catch (error) {
        console.error('Error fetching pedido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar un pedido
app.put('/pedido/:id', async (req, res) => {
    const idPedido = req.params.id;
    const { fechaPedido, idEmpleado, productos } = req.body;

    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        // Primero actualizamos el pedido básico
        await connection.query('UPDATE pedido SET fechaPedido = ?, idEmpleado = ? WHERE idPedido = ?', [fechaPedido, idEmpleado, idPedido]);

        // Luego eliminamos los detalles antiguos
        await connection.query('DELETE FROM detallepedido WHERE idPedido = ?', [idPedido]);

        // Insertamos los nuevos detalles
        const insertDetalleQuery = 'INSERT INTO detallepedido (idPedido, idProducto, cantidad) VALUES ?';
        const detalles = productos.map(p => [idPedido, p.idProducto, p.cantidad]);
        await connection.query(insertDetalleQuery, [detalles]);

        // Calculamos el nuevo total
        const [totalResults] = await connection.query(`
            SELECT SUM(dp.cantidad * p.precio) as total
            FROM detallepedido dp
            JOIN producto p ON dp.idProducto = p.idProducto
            WHERE dp.idPedido = ?
        `, [idPedido]);

        const nuevoTotal = totalResults[0].total;

        // Actualizamos la factura con el nuevo total si existe
        await connection.query('UPDATE factura SET totalPago = ? WHERE idPedido = ?', [nuevoTotal, idPedido]);

        await connection.commit();
        res.json({ 
            message: 'Pedido actualizado con éxito',
            nuevoTotal: nuevoTotal
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating pedido:', error);
        res.status(500).json({ error: 'Error al actualizar el pedido' });
    } finally {
        connection.release();
    }
});

// Eliminar un pedido
app.delete('/pedido/:id', async (req, res) => {
    const idPedido = req.params.id;

    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query('DELETE FROM detallepedido WHERE idPedido = ?', [idPedido]);
        await connection.query('DELETE FROM pedido WHERE idPedido = ?', [idPedido]);

        await connection.commit();
        res.json({ message: 'Pedido eliminado con éxito' });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting pedido:', error);
        res.status(500).json({ error: 'Error al eliminar el pedido' });
    } finally {
        connection.release();
    }
});

// Generar factura
app.post('/generar-factura/:idPedido', async (req, res) => {
    const idPedido = req.params.idPedido;
    const { metodoPago } = req.body;

    try {
        // Primero, verificar si ya existe una factura para este pedido
        const [checkResults] = await promisePool.query('SELECT idFactura FROM factura WHERE idPedido = ?', [idPedido]);
        
        if (checkResults.length > 0) {
            // Ya existe una factura para este pedido
            return res.status(400).json({ error: 'Ya existe una factura para este pedido', idFactura: checkResults[0].idFactura });
        }

        // Si no existe factura, procedemos a crearla
        const [pedidoResults] = await promisePool.query(`
            SELECT p.idPedido, p.fechaPedido, p.idEmpleado, dp.idProducto, dp.cantidad, pr.precio
            FROM pedido p
            JOIN detallepedido dp ON p.idPedido = dp.idPedido
            JOIN producto pr ON dp.idProducto = pr.idProducto
            WHERE p.idPedido = ?
        `, [idPedido]);

        if (pedidoResults.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        const totalPago = pedidoResults.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

        const [insertResult] = await promisePool.query(
            'INSERT INTO factura (idPedido, fechaFactura, metodoPago, totalPago) VALUES (?, NOW(), ?, ?)',
            [idPedido, metodoPago, totalPago]
        );

        res.json({ message: 'Factura generada con éxito', idFactura: insertResult.insertId, totalPago });
    } catch (error) {
        console.error('Error generating factura:', error);
        res.status(500).json({ error: 'Error al generar la factura' });
    }
});

// Ruta para obtener la información de la factura
app.get('/factura/:idPedido', async (req, res) => {
    const idPedido = req.params.idPedido;
    const query = `
        SELECT f.*, p.fechaPedido, p.idEmpleado,
               dp.idProducto, dp.cantidad,
               pr.descripcion, pr.precio,
               (dp.cantidad * pr.precio) as subtotal
        FROM factura f
        JOIN pedido p ON f.idPedido = p.idPedido
        JOIN detallepedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE f.idPedido = ?
    `;

    try {
        const [results] = await promisePool.query(query, [idPedido]);

        if (results.length === 0) {
            return res.status(404).json({ message: 'Factura no encontrada' });
        }

        // Calcular el total real basado en los productos actuales
        const total = results.reduce((sum, row) => sum + (row.cantidad * row.precio), 0);

        // Estructurar la respuesta
        const factura = {
            idFactura: results[0].idFactura,
            idPedido: results[0].idPedido,
            fechaFactura: results[0].fechaFactura,
            metodoPago: results[0].metodoPago,
            totalPago: total, // Usar el total calculado
            fechaPedido: results[0].fechaPedido,
            idEmpleado: results[0].idEmpleado,
            productos: results.map(row => ({
                idProducto: row.idProducto,
                descripcion: row.descripcion,
                cantidad: row.cantidad,
                precio: row.precio,
                subtotal: row.subtotal
            }))
        };

        // Actualizar el total en la base de datos si es diferente
        if (total !== results[0].totalPago) {
            await promisePool.query('UPDATE factura SET totalPago = ? WHERE idPedido = ?', [total, idPedido]);
        }

        res.json(factura);
    } catch (error) {
        console.error('Error fetching factura:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Consultas
app.get('/consulta-facturas', async (req, res) => {
    const { fechaInicio, fechaFin, tipo } = req.query;

    if (!fechaInicio || !fechaFin || !tipo) {
        return res.status(400).json({ error: 'Faltan parámetros necesarios' });
    }

    let groupBy, dateFormat;
    switch (tipo) {
        case 'diaria':
            groupBy = 'DATE(f.fechaFactura)';
            dateFormat = '%d/%m/%Y';
            break;
        case 'semanal':
            groupBy = 'YEARWEEK(f.fechaFactura, 1)';
            dateFormat = '%d/%m/%Y';
            break;
        case 'mensual':
            groupBy = 'YEAR(f.fechaFactura), MONTH(f.fechaFactura)';
            dateFormat = '%m/%Y';
            break;
        default:
            return res.status(400).json({ error: 'Tipo de consulta inválido' });
    }

    const query = `
        SELECT 
            DATE_FORMAT(MIN(f.fechaFactura), '${dateFormat}') as fecha,
            COUNT(*) as cantidad,
            SUM(f.totalPago) as monto
        FROM 
            factura f
        WHERE 
            f.fechaFactura BETWEEN ? AND ?
        GROUP BY 
            ${groupBy}
        ORDER BY 
            MIN(f.fechaFactura)
    `;

    try {
        const [detalles] = await promisePool.query(query, [fechaInicio, fechaFin]);

        // Calcular totales
        const totalFacturas = detalles.reduce((sum, row) => sum + row.cantidad, 0);
        const montoTotal = detalles.reduce((sum, row) => sum + parseFloat(row.monto), 0);

        res.json({
            totalFacturas,
            montoTotal,
            detalles: detalles.map(row => ({
                fecha: row.fecha,
                cantidad: row.cantidad,
                monto: parseFloat(row.monto)
            }))
        });
    } catch (error) {
        console.error('Error en la consulta de facturas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/consulta-empleados-facturaron', async (req, res) => {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({ error: 'Faltan parámetros necesarios' });
    }

    const query = `
        SELECT 
            e.idEmpleado,
            e.nombre,
            COUNT(f.idFactura) as totalFacturas,
            COALESCE(SUM(f.totalPago), 0) as montoTotal
        FROM empleado e
        LEFT JOIN pedido p ON e.idEmpleado = p.idEmpleado
        LEFT JOIN factura f ON p.idPedido = f.idPedido AND f.fechaFactura BETWEEN ? AND ?
        GROUP BY e.idEmpleado, e.nombre
        HAVING totalFacturas > 0
        ORDER BY montoTotal DESC
    `;

    try {
        const [results] = await promisePool.query(query, [fechaInicio, fechaFin]);

        // Ensure numeric values
        const formattedResults = results.map(row => ({
            ...row,
            totalFacturas: parseInt(row.totalFacturas) || 0,
            montoTotal: parseFloat(row.montoTotal) || 0
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Error en la consulta de empleados:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

//PDF facturas
app.get('/generar-factura-pdf/:idFactura', async (req, res) => {
    const idFactura = req.params.idFactura;
    const query = `
        SELECT f.*, p.fechaPedido, e.nombre as nombreEmpleado, pr.descripcion, dp.cantidad, pr.precio
        FROM factura f
        JOIN pedido p ON f.idPedido = p.idPedido
        JOIN empleado e ON p.idEmpleado = e.idEmpleado
        JOIN detallepedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE f.idFactura = ?
    `;

    try {
        const [results] = await promisePool.query(query, [idFactura]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const factura = results[0];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const filename = `factura_${idFactura}.pdf`;

        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        doc.fontSize(20).text('Factura', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Número de Factura: ${factura.idFactura}`);
        doc.text(`Fecha: ${new Date(factura.fechaFactura).toLocaleDateString()}`);
        doc.text(`Empleado: ${factura.nombreEmpleado}`);
        doc.text(`Método de Pago: ${factura.metodoPago}`);
        doc.moveDown();

        doc.text('Detalles del Pedido:');
        results.forEach(item => {
            doc.text(`${item.descripcion} - Cantidad: ${item.cantidad} - Precio: $${item.precio} - Subtotal: $${item.cantidad * item.precio}`);
        });

        doc.moveDown();
        doc.fontSize(16).text(`Total: $${factura.totalPago}`, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error('Error al generar factura PDF:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/consulta-productos-mas-vendidos', async (req, res) => {
    const { fechaInicio, fechaFin, limite } = req.query;

    if (!fechaInicio || !fechaFin || !limite) {
        return res.status(400).json({ error: 'Faltan parámetros necesarios' });
    }

    const query = `
        SELECT 
            p.idProducto,
            p.descripcion,
            SUM(dp.cantidad) as cantidadVendida,
            SUM(dp.cantidad * p.precio) as montoTotal
        FROM 
            producto p
            JOIN detallepedido dp ON p.idProducto = dp.idProducto
            JOIN pedido ped ON dp.idPedido = ped.idPedido
            JOIN factura f ON ped.idPedido = f.idPedido
        WHERE 
            f.fechaFactura BETWEEN ? AND ?
        GROUP BY 
            p.idProducto, p.descripcion
        ORDER BY 
            cantidadVendida DESC
        LIMIT ?
    `;

    try {
        const [results] = await promisePool.query(query, [fechaInicio, fechaFin, parseInt(limite)]);

        // Ensure numeric values
        const formattedResults = results.map(row => ({
            ...row,
            cantidadVendida: parseInt(row.cantidadVendida) || 0,
            montoTotal: parseFloat(row.montoTotal) || 0
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Error en la consulta de productos más vendidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.use((req, res, next) => {
    res.status(404).send("Lo siento, no se pudo encontrar esa ruta!");
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});