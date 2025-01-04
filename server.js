const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la conexión a la base de datos
const connectionConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  connectTimeout: 10000
};

const connection = mysql.createConnection(connectionConfig);

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database successfully!');
});

// Ruta para la página de inicio (login)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Aquí van tus otras rutas...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Ruta para agregar una categoría
app.post('/categoria', (req, res) => {
  const { nombre_cat } = req.body; // Cambia nombre_categoria a nombre_cat
  const query = 'INSERT INTO categoria (nombre_categoria) VALUES (?)';
  connection.query(query, [nombre_cat], (err, result) => {
      if (err) return res.status(500).send(err);
      res.status(201).json({ id: result.insertId, nombre_categoria: nombre_cat });
  });
});

// Ruta para obtener todas las categorías (para llenar el campo <option> en el HTML)
app.get('/categorias', (req, res) => {
  connection.query('SELECT * FROM categoria', (err, results) => {
      if (err) {
          console.error('Error al obtener categorías:', err);
          return res.status(500).send(err);
      }
      console.log('Categorías obtenidas:', results); // Agregar log
      res.status(200).json(results);
  });
});

// Ruta para crear usuarios
app.post('/crearUsuario', (req, res) => {
    const { nombre, password, role } = req.body; 
  
    let query;
    if (role === 'empleado') {
        query = 'INSERT INTO empleado (nombre, contraseña) VALUES (?, ?)'; 
    } else if (role === 'administrador') {
        query = 'INSERT INTO administrador (nombre, contraseña) VALUES (?, ?)'; 
    } else {
        return res.status(400).json({ success: false, message: 'Rol no válido' });
    }
  
    // Aquí estamos insertando la contraseña tal cual
    connection.query(query, [nombre, password], (err) => { 
        if (err) return res.status(500).json({ success: false, error: err });
        res.status(201).json({ success: true });
    });
});

// Ruta para iniciar sesión
app.post('/login', (req, res) => {
    const { nombre, contraseña } = req.body;

    // Buscar en la tabla de empleados
    connection.query('SELECT * FROM empleado WHERE nombre = ?', [nombre], (err, employeeResults) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error en la base de datos' });
        }
        // Verifica si se encontró un empleado
        if (employeeResults.length > 0) {
            if (employeeResults[0].contraseña === contraseña) {
                return res.status(200).json({ 
                    success: true, 
                    role: 'empleado',
                    idEmpleado: employeeResults[0].idEmpleado  // Añadimos el idEmpleado aquí
                });
            } else {
                return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
            }
        }

        // Si no se encuentra, buscar en la tabla de administradores
        connection.query('SELECT * FROM administrador WHERE nombre = ?', [nombre], (err, adminResults) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error en la base de datos' });
            }
            // Verifica si se encontró un administrador
            if (adminResults.length > 0) {
                if (adminResults[0].contraseña === contraseña) {
                    return res.status(200).json({ 
                        success: true, 
                        role: 'administrador', 
                        idAdmin: adminResults[0].idAdmin
                    });
                } else {
                    return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
                }
            }
            // Si no se encuentra ningún usuario
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        });
    });
});

// Ruta para agregar un producto
app.post('/producto', (req, res) => {
    console.log('Datos recibidos para agregar producto:', req.body); 
    const { idCategoria, descripcion, precio, idAdmin } = req.body;

    // Verificación de que el precio sea un número válido
    if (isNaN(precio)) {
        console.error('Precio no válido:', precio);
        return res.status(400).send('Precio no válido');
    }

    // Asegúrate de que idAdmin no sea nulo
    if (!idAdmin) {
        return res.status(400).send('idAdmin es requerido');
    }

    // Consulta para insertar el producto en la tabla Producto
    const queryInsertProducto = 'INSERT INTO producto (idCategoria, descripcion, precio, idAdmin) VALUES (?, ?, ?, ?)';
    
    // Insertar el producto
    connection.query(queryInsertProducto, [idCategoria, descripcion, precio, idAdmin], (err, result) => {
        if (err) {
            console.error('Error al agregar producto:', err);
            return res.status(500).send(err);
        }

        const idProducto = result.insertId;
 
        // Respuesta exitosa
        res.status(201).json({ 
            message: 'Producto agregado exitosamente',
            idProducto, 
            idCategoria,  
            descripcion, 
            precio, 
            idAdmin 
        });
    });
});

// Ruta para obtener todos los productos con su categoría
app.get('/productos', (req, res) => {
    const query = `
        SELECT c.nombre_categoria, p.idProducto, p.descripcion, p.precio
        FROM producto p
        JOIN categoria c ON p.idCategoria = c.idCategoria
    `;
    connection.query(query, (err, results) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.json(results);
    });
});

// Ruta para guardar pedido y detallePedido
app.post('/pedido', (req, res) => {
    const { idEmpleado, productos } = req.body;
    const fechaPedido = new Date();

    console.log("Iniciando inserción de pedido:", { idEmpleado, productos });

    // Verificar que todos los productos tengan un idProducto válido
    const productosValidos = productos.filter(p => p.idProducto && !isNaN(p.idProducto));
    if (productosValidos.length !== productos.length) {
        return res.status(400).json({ success: false, error: 'Algunos productos no tienen un ID válido' });
    }

    // Inserta el pedido en la tabla Pedido
    const pedidoQuery = 'INSERT INTO pedido (fechaPedido, idEmpleado) VALUES (?, ?)';
    connection.query(pedidoQuery, [fechaPedido, idEmpleado], (err, result) => {
        if (err) {
            console.error("Error al insertar en Pedido:", err);
            return res.status(500).json({ success: false, error: err.message });
        }

        const idPedido = result.insertId;
        console.log("Pedido insertado con ID:", idPedido);

        // Inserta cada producto en la tabla DetallePedido
        const detalleQueries = productosValidos.map(producto => {
            return new Promise((resolve, reject) => {
                const detalleQuery = 'INSERT INTO detallePedido (idPedido, idProducto, cantidad) VALUES (?, ?, ?)';
                connection.query(detalleQuery, [idPedido, producto.idProducto, producto.cantidad], (err) => {
                    if (err) {
                        console.error("Error al insertar en DetallePedido:", err);
                        reject(err);
                    } else {
                        console.log("Producto insertado en DetallePedido:", producto);
                        resolve();
                    }
                });
            });
        });

        // Ejecuta todas las inserciones de DetallePedido
        Promise.all(detalleQueries)
            .then(() => res.status(201).json({ success: true, idPedido }))
            .catch(err => {
                console.error("Error en Promesas de DetallePedido:", err);
                res.status(500).json({ success: false, error: err.message });
            });
    });
});


// Obtener todos los usuarios
app.get('/usuarios', (req, res) => {
    const query = `
        SELECT idEmpleado as id, nombre, 'empleado' as role FROM empleado
        UNION ALL
        SELECT idAdmin as id, nombre, 'administrador' as role FROM administrador
    `;
    connection.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Obtener un usuario específico
app.get('/usuario/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT idEmpleado as id, nombre, 'empleado' as role FROM empleado WHERE idEmpleado = ?
        UNION ALL
        SELECT idAdmin as id, nombre, 'administrador' as role FROM administrador WHERE idAdmin = ?
    `;
    connection.query(query, [id, id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        res.json(results[0]);
    });
});

// Actualizar un usuario
app.put('/usuario/:id', (req, res) => {
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

    connection.query(query, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) {
            const moveQuery = `INSERT INTO ${newTable} (nombre, contraseña) 
                               SELECT nombre, contraseña FROM ${oldTable} WHERE ${oldTable === 'empleado' ? 'idEmpleado' : 'idAdmin'} = ?`;
            connection.query(moveQuery, [id], (err, moveResult) => {
                if (err) return res.status(500).json({ error: err.message });
                if (moveResult.affectedRows === 0) {
                    return res.status(404).json({ message: 'Usuario no encontrado' });
                }
                connection.query(`DELETE FROM ${oldTable} WHERE ${oldTable === 'empleado' ? 'idEmpleado' : 'idAdmin'} = ?`, [id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Usuario actualizado y movido exitosamente' });
                });
            });
        } else {
            res.json({ message: 'Usuario actualizado exitosamente' });
        }
    });
});

// Ruta para eliminar un usuario
app.delete('/usuario/:id', (req, res) => {
    const { id } = req.params;
    
    // Primero intentamos eliminar de la tabla empleado
    connection.query('DELETE FROM empleado WHERE idEmpleado = ?', [id], (err, resultEmpleado) => {
        if (err) {
            console.error("Error al eliminar empleado:", err);
            return res.status(500).json({ error: 'Error al eliminar usuario' });
        }

        // Luego intentamos eliminar de la tabla administrador
        connection.query('DELETE FROM administrador WHERE idAdmin = ?', [id], (err, resultAdmin) => {
            if (err) {
                console.error("Error al eliminar administrador:", err);
                return res.status(500).json({ error: 'Error al eliminar usuario' });
            }

            // Verificamos si se eliminó algún registro
            if (resultEmpleado.affectedRows === 0 && resultAdmin.affectedRows === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            res.json({ message: 'Usuario eliminado exitosamente' });
        });
    });
});

// Obtener todas las categorías
app.get('/categorias', (req, res) => {
    const query = `SELECT idCategoria as id, nombre FROM categoria`;
    connection.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Obtener una categoría específica
app.get('/categoria/:id', (req, res) => {
    const { id } = req.params;
    const query = `SELECT idCategoria as id, nombre FROM categoria WHERE idCategoria = ?`;
    connection.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
        res.json(results[0]);
    });
});

// Actualizar una categoría
app.put('/categoria/:id', (req, res) => {
    const { id } = req.params;
    const { nombre_categoria } = req.body;

    const query = 'UPDATE categoria SET nombre_categoria = ? WHERE idCategoria = ?';
    connection.query(query, [nombre_categoria, id], (err, result) => {
        if (err) {
            console.error("Error al actualizar categoría:", err);
            return res.status(500).json({ error: 'Error al actualizar categoría' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }
        res.json({ message: 'Categoría actualizada exitosamente' });
    });
});
 

// Eliminar una categoría
app.delete('/categoria/:id', (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM categoria WHERE idCategoria = ?`;
    
    connection.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
        res.json({ message: 'Categoría eliminada exitosamente' });
    });
});

// Obtener todos los productos
app.get('/productos', (req, res) => {
    const query = `SELECT idProducto as id, descripcion, precio, idCategoria FROM producto`;
    connection.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Obtener un producto específico
app.get('/producto/:id', (req, res) => {
    const { id } = req.params;
    const query = `SELECT idProducto as id, descripcion, precio, idCategoria FROM producto WHERE idProducto = ?`;
    connection.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
        res.json(results[0]);
    });
});

// Ruta para actualizar un producto
app.put('/producto/:id', (req, res) => {
    const { id } = req.params;
    const { descripcion, precio, idCategoria } = req.body;
    const query = 'UPDATE producto SET descripcion = ?, precio = ?, idCategoria = ? WHERE idProducto = ?';
    connection.query(query, [descripcion, precio, idCategoria, id], (err, result) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            return res.status(500).json({ error: 'Error al actualizar producto' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto actualizado exitosamente' });
    });
});

// Ruta para eliminar un producto
app.delete('/producto/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM producto WHERE idProducto = ?';
    connection.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            return res.status(500).json({ error: 'Error al eliminar producto' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto eliminado exitosamente' });
    });
});


// Obtener todos los pedidos
app.get('/pedidos', (req, res) => {
    const query = 'SELECT * FROM pedido';
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching pedidos:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }
        res.json(results);
    });
});

// Obtener un pedido específico con sus productos
app.get('/pedido/:id', (req, res) => {
    const idPedido = req.params.id;
    const query = `
        SELECT p.*, dp.idProducto, dp.cantidad, pr.descripcion
        FROM pedido p
        JOIN detallePedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE p.idPedido = ?
    `;
    connection.query(query, [idPedido], (error, results) => {
        if (error) {
            console.error('Error fetching pedido:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ message: 'Pedido no encontrado' });
            return;
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
    });
});

// Actualizar un pedido
app.put('/pedido/:id', (req, res) => {
    const idPedido = req.params.id;
    const { fechaPedido, idEmpleado, productos } = req.body;

    connection.beginTransaction(err => {
        if (err) {
            console.error('Error starting transaction:', err);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }

        // Primero actualizamos el pedido básico
        const updatePedidoQuery = 'UPDATE pedido SET fechaPedido = ?, idEmpleado = ? WHERE idPedido = ?';
        connection.query(updatePedidoQuery, [fechaPedido, idEmpleado, idPedido], (error) => {
            if (error) {
                return connection.rollback(() => {
                    console.error('Error updating pedido:', error);
                    res.status(500).json({ error: 'Error al actualizar el pedido' });
                });
            }

            // Luego eliminamos los detalles antiguos
            const deleteDetallesQuery = 'DELETE FROM detallePedido WHERE idPedido = ?';
            connection.query(deleteDetallesQuery, [idPedido], (error) => {
                if (error) {
                    return connection.rollback(() => {
                        console.error('Error deleting detallePedido:', error);
                        res.status(500).json({ error: 'Error al actualizar el pedido' });
                    });
                }

                // Insertamos los nuevos detalles
                const insertDetalleQuery = 'INSERT INTO detallePedido (idPedido, idProducto, cantidad) VALUES ?';
                const detalles = productos.map(p => [idPedido, p.idProducto, p.cantidad]);
                connection.query(insertDetalleQuery, [detalles], (error) => {
                    if (error) {
                        return connection.rollback(() => {
                            console.error('Error inserting new detallePedido:', error);
                            res.status(500).json({ error: 'Error al actualizar el pedido' });
                        });
                    }

                    // Calculamos el nuevo total
                    const calcularTotalQuery = `
                        SELECT SUM(dp.cantidad * p.precio) as total
                        FROM detallePedido dp
                        JOIN producto p ON dp.idProducto = p.idProducto
                        WHERE dp.idPedido = ?
                    `;
                    connection.query(calcularTotalQuery, [idPedido], (error, results) => {
                        if (error) {
                            return connection.rollback(() => {
                                console.error('Error calculating total:', error);
                                res.status(500).json({ error: 'Error al calcular el total' });
                            });
                        }

                        const nuevoTotal = results[0].total;

                        // Actualizamos la factura con el nuevo total si existe
                        const updateFacturaQuery = `
                            UPDATE factura 
                            SET totalPago = ?
                            WHERE idPedido = ?
                        `;
                        connection.query(updateFacturaQuery, [nuevoTotal, idPedido], (error) => {
                            if (error) {
                                return connection.rollback(() => {
                                    console.error('Error updating factura:', error);
                                    res.status(500).json({ error: 'Error al actualizar la factura' });
                                });
                            }

                            connection.commit(err => {
                                if (err) {
                                    return connection.rollback(() => {
                                        console.error('Error committing transaction:', err);
                                        res.status(500).json({ error: 'Error al actualizar el pedido' });
                                    });
                                }
                                res.json({ 
                                    message: 'Pedido actualizado con éxito',
                                    nuevoTotal: nuevoTotal
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Eliminar un pedido
app.delete('/pedido/:id', (req, res) => {
    const idPedido = req.params.id;

    connection.beginTransaction(err => {
        if (err) {
            console.error('Error starting transaction:', err);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }

        const deleteDetallesQuery = 'DELETE FROM detallePedido WHERE idPedido = ?';
        connection.query(deleteDetallesQuery, [idPedido], (error) => {
            if (error) {
                return connection.rollback(() => {
                    console.error('Error deleting detallePedido:', error);
                    res.status(500).json({ error: 'Error al eliminar el pedido' });
                });
            }

            const deletePedidoQuery = 'DELETE FROM pedido WHERE idPedido = ?';
            connection.query(deletePedidoQuery, [idPedido], (error) => {
                if (error) {
                    return connection.rollback(() => {
                        console.error('Error deleting pedido:', error);
                        res.status(500).json({ error: 'Error al eliminar el pedido' });
                    });
                }

                connection.commit(err => {
                    if (err) {
                        return connection.rollback(() => {
                            console.error('Error committing transaction:', err);
                            res.status(500).json({ error: 'Error al eliminar el pedido' });
                        });
                    }
                    res.json({ message: 'Pedido eliminado con éxito' });
                });
            });
        });
    });
});

// Generar factura
app.post('/generar-factura/:idPedido', (req, res) => {
    const idPedido = req.params.idPedido;
    const { metodoPago } = req.body;

    const queryPedido = `
        SELECT p.idPedido, p.fechaPedido, p.idEmpleado, dp.idProducto, dp.cantidad, pr.precio
        FROM pedido p
        JOIN detallePedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE p.idPedido = ?
    `;

    connection.query(queryPedido, [idPedido], (error, results) => {
        if (error) {
            console.error('Error fetching pedido details:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ message: 'Pedido no encontrado' });
            return;
        }

        const totalPago = results.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

        const insertFacturaQuery = 'INSERT INTO factura (idPedido, fechaFactura, metodoPago, totalPago) VALUES (?, NOW(), ?, ?)';
        connection.query(insertFacturaQuery, [idPedido, metodoPago, totalPago], (error, result) => {
            if (error) {
                console.error('Error generating factura:', error);
                res.status(500).json({ error: 'Error al generar la factura' });
                return;
            }
            res.json({ message: 'Factura generada con éxito', idFactura: result.insertId, totalPago });
        });
    });
});

// Ruta para obtener la información de la factura
app.get('/factura/:idPedido', (req, res) => {
    const idPedido = req.params.idPedido;
    const query = `
        SELECT f.*, p.fechaPedido, p.idEmpleado,
               dp.idProducto, dp.cantidad,
               pr.descripcion, pr.precio,
               (dp.cantidad * pr.precio) as subtotal
        FROM factura f
        JOIN pedido p ON f.idPedido = p.idPedido
        JOIN detallePedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE f.idPedido = ?
    `;

    connection.query(query, [idPedido], (error, results) => {
        if (error) {
            console.error('Error fetching factura:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ message: 'Factura no encontrada' });
            return;
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
            const updateTotalQuery = 'UPDATE factura SET totalPago = ? WHERE idPedido = ?';
            connection.query(updateTotalQuery, [total, idPedido], (error) => {
                if (error) {
                    console.error('Error updating factura total:', error);
                }
            });
        }

        res.json(factura);
    });
});

// Otra ruta para obtener todos los productos
app.get('/productos', (req, res) => {
    const query = 'SELECT * FROM producto';
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching productos:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }
        res.json(results);
    });
});

// Consultas
app.get('/consulta-facturas', (req, res) => {
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

    connection.query(query, [fechaInicio, fechaFin], (error, detalles) => {
        if (error) {
            console.error('Error en la consulta de facturas:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

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
    });
});

app.get('/consulta-empleados-facturaron', (req, res) => {
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

    connection.query(query, [fechaInicio, fechaFin], (error, results) => {
        if (error) {
            console.error('Error en la consulta de empleados:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        // Ensure numeric values
        const formattedResults = results.map(row => ({
            ...row,
            totalFacturas: parseInt(row.totalFacturas) || 0,
            montoTotal: parseFloat(row.montoTotal) || 0
        }));

        res.json(formattedResults);
    });
});

//PDF facturas
app.get('/generar-factura-pdf/:idFactura', (req, res) => {
    const idFactura = req.params.idFactura;
    const query = `
        SELECT f.*, p.fechaPedido, e.nombre as nombreEmpleado, pr.descripcion, dp.cantidad, pr.precio
        FROM factura f
        JOIN pedido p ON f.idPedido = p.idPedido
        JOIN empleado e ON p.idEmpleado = e.idEmpleado
        JOIN detallePedido dp ON p.idPedido = dp.idPedido
        JOIN producto pr ON dp.idProducto = pr.idProducto
        WHERE f.idFactura = ?
    `;

    connection.query(query, [idFactura], (error, results) => {
        if (error) {
            console.error('Error al generar factura PDF:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ error: 'Factura no encontrada' });
            return;
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
    });
});

app.get('/consulta-productos-mas-vendidos', (req, res) => {
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
            JOIN detallePedido dp ON p.idProducto = dp.idProducto
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

    connection.query(query, [fechaInicio, fechaFin, parseInt(limite)], (error, results) => {
        if (error) {
            console.error('Error en la consulta de productos más vendidos:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        // Ensure numeric values
        const formattedResults = results.map(row => ({
            ...row,
            cantidadVendida: parseInt(row.cantidadVendida) || 0,
            montoTotal: parseFloat(row.montoTotal) || 0
        }));

        res.json(formattedResults);
    });
});
