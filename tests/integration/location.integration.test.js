/**
 * Tests de integración — módulo location
 *
 * Estrategia:
 *  - Supertest dispara peticiones HTTP reales contra la app Express.
 *  - La app se conecta a una base de datos MongoDB de test (ver jest.integration.config.js).
 *  - Los clientes HTTP externos (friendsClient, usersClient) son mockeados porque esos
 *    servicios no están disponibles en el entorno de CI; la integración real que se verifica
 *    es la del código de negocio con MongoDB.
 *  - Antes de cada test se eliminan todos los documentos para garantizar aislamiento total.
 *  - Al finalizar la suite se cierra la conexión a MongoDB.
 *
 * Cobertura (patrón AAA — Arrange / Act / Assert):
 *  - Middleware authenticate (401 con y sin token; 401 con token de admin)
 *  - Validación de esquemas Zod (400) en todos los endpoints que aceptan body
 *  - POST   /api/locations               — updateLocation (incl. rate limiting, transferencia y
 *                                          expiración de etiqueta por tiempo y distancia)
 *  - POST   /api/locations/friends       — getFriendsLocations (incl. exclusión de privados vía
 *                                          aggregation, amigo sin ubicación registrada)
 *  - PATCH  /api/locations/privacy       — setPrivacyStatus
 *  - GET    /api/locations/privacy       — getPrivacyStatus
 *  - POST   /api/locations/radar         — getRadar (incl. exclusión de privados, amigos y self)
 *  - PUT    /api/locations/label         — updateLabel (incl. sanitización HTML, label vacío)
 *  - DELETE /api/locations/label         — deleteLabel
 */

// Mocks hoisted antes de cualquier require (Jest los eleva al tope del módulo)
jest.mock('../../src/clients/friendsClient', () => ({
  friendsClient: { getFriendIds: jest.fn() },
}));
jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    getUserProfiles: jest.fn(),
    updateUserPrivacy: jest.fn(),
    getPreferences: jest.fn(),
  },
}));

const request  = require('supertest');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

// setupFiles ya seteó process.env antes de este require
const app = require('../../src/app');
const { Location, LocationPrivacy } = require('../../src/modules/locations/location.model');
const { friendsClient } = require('../../src/clients/friendsClient');
const { usersClient }   = require('../../src/clients/usersClient');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;

/** Genera un JWT válido con el sub indicado (sin campo role). */
function makeToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET);
}

/** Header Authorization listo para pasarle a supertest. */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// IDs y tokens de usuarios de prueba
// ---------------------------------------------------------------------------

const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c';

const tokenA = makeToken(USER_A);

// Buenos Aires — punto central de referencia
const LAT_CENTER = -34.6037;
const LON_CENTER = -58.3816;

// ~144 m del centro (dentro del umbral de 500 m para transferencia de etiqueta)
const LAT_CERCA = -34.6050;
const LON_CERCA = -58.3830;

// ~150 km del centro (fuera de cualquier radio razonable)
const LAT_LEJOS = -35.6037;
const LON_LEJOS = -59.3816;

// ---------------------------------------------------------------------------
// Setup / teardown de la suite
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

beforeEach(async () => {
  // Limpia las colecciones antes de cada test para garantizar aislamiento.
  await Location.deleteMany({});
  await LocationPrivacy.deleteMany({});
  jest.clearAllMocks();
  // Valores por defecto para los mocks externos
  friendsClient.getFriendIds.mockResolvedValue([]);
  usersClient.getUserProfiles.mockResolvedValue([]);
  usersClient.updateUserPrivacy.mockResolvedValue(undefined);
  usersClient.getPreferences.mockResolvedValue({ search_radius_km: 25 });
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ===========================================================================
// GET /health
// ===========================================================================

describe('GET /health', () => {
  it('devuelve 200 con status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ===========================================================================
// Middleware authenticate
// ===========================================================================

describe('middleware authenticate', () => {
  it('devuelve 401 cuando no se envía token', async () => {
    // Arrange: sin Authorization header
    // Act
    const res = await request(app).get('/api/locations/privacy');
    // Assert
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('devuelve 401 cuando el token está malformado', async () => {
    const res = await request(app)
      .get('/api/locations/privacy')
      .set('Authorization', 'Bearer token-invalido-xxxx');

    expect(res.status).toBe(401);
  });

  it('devuelve 401 cuando el token fue firmado con otro secreto', async () => {
    const tokenConOtroSecreto = jwt.sign({ sub: USER_A }, 'secreto-incorrecto');
    const res = await request(app)
      .get('/api/locations/privacy')
      .set(authHeader(tokenConOtroSecreto));

    expect(res.status).toBe(401);
  });

  it('devuelve 401 cuando el token pertenece a un admin (payload contiene role)', async () => {
    // Arrange: token con campo role — el middleware lo rechaza aunque sea válido
    const tokenAdmin = jwt.sign({ sub: USER_A, role: 'admin' }, JWT_SECRET);
    // Act
    const res = await request(app)
      .get('/api/locations/privacy')
      .set(authHeader(tokenAdmin));
    // Assert
    expect(res.status).toBe(401);
  });

  it('permite el acceso con un token de usuario válido', async () => {
    const res = await request(app)
      .get('/api/locations/privacy')
      .set(authHeader(tokenA));

    // No importa el cuerpo; lo que importa es que no sea 401
    expect(res.status).not.toBe(401);
  });
});

// ===========================================================================
// POST /api/locations — updateLocation
// ===========================================================================

describe('POST /api/locations', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/locations')
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando faltan campos obligatorios en el body', async () => {
    // Arrange: falta longitude
    const res = await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve 200 y persiste la ubicación en MongoDB', async () => {
    // Act
    const res = await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Ubicación actualizada' });

    // Assert DB
    const guardado = await Location.findOne({ userId: USER_A });
    expect(guardado).not.toBeNull();
    expect(Number(guardado.latitude)).toBeCloseTo(LAT_CENTER, 4);
    expect(Number(guardado.longitude)).toBeCloseTo(LON_CENTER, 4);
  });

  it('devuelve 429 cuando se actualiza antes del intervalo mínimo (via locationUpdateFrequency)', async () => {
    // Arrange: primera actualización exitosa con frecuencia de 5 minutos
    const body = { latitude: LAT_CENTER, longitude: LON_CENTER, locationUpdateFrequency: 5 };
    await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send(body)
      .expect(200);

    // Act: segunda actualización inmediata — debe superar el rate limit
    const res = await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send(body);

    // Assert
    expect(res.status).toBe(429);
  });

  it('transfiere la etiqueta cuando el usuario permanece dentro de los 500 m', async () => {
    // Arrange: ubicación previa con etiqueta, usuario a ~144 m del origen de la etiqueta
    await Location.create({
      userId: USER_A,
      latitude: LAT_CENTER,
      longitude: LON_CENTER,
      label: 'Biblioteca',
      labelLatitude: LAT_CENTER,
      labelLongitude: LON_CENTER,
      labelCreatedAt: new Date(),
    });

    // Act
    await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CERCA, longitude: LON_CERCA })
      .expect(200);

    // Assert: la nueva entrada hereda la etiqueta
    const ultima = await Location.findOne({ userId: USER_A }).sort({ createdAt: -1 });
    expect(ultima.label).toBe('Biblioteca');
  });

  it('invalida la etiqueta cuando pasaron más de 6 horas desde su creación, aunque el usuario esté cerca', async () => {
    // Arrange: ubicación con etiqueta cuya labelCreatedAt es de hace 7 horas
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await Location.create({
      userId: USER_A,
      latitude: LAT_CENTER,
      longitude: LON_CENTER,
      label: 'Biblioteca',
      labelLatitude: LAT_CENTER,
      labelLongitude: LON_CENTER,
      labelCreatedAt: sevenHoursAgo,
    });

    // Act: nueva posición dentro de los 500 m — solo la antigüedad invalida la etiqueta
    await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CERCA, longitude: LON_CERCA })
      .expect(200);

    // Assert: la nueva entrada no hereda la etiqueta expirada
    const ultima = await Location.findOne({ userId: USER_A }).sort({ createdAt: -1 });
    expect(ultima.label).toBeNull();
  });

  it('elimina la etiqueta cuando el usuario se aleja más de 500 m', async () => {
    // Arrange
    await Location.create({
      userId: USER_A,
      latitude: LAT_CENTER,
      longitude: LON_CENTER,
      label: 'Biblioteca',
      labelLatitude: LAT_CENTER,
      labelLongitude: LON_CENTER,
      labelCreatedAt: new Date(),
    });

    // Act: movimiento de ~150 km
    await request(app)
      .post('/api/locations')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_LEJOS, longitude: LON_LEJOS })
      .expect(200);

    // Assert: la nueva entrada no tiene etiqueta
    const ultima = await Location.findOne({ userId: USER_A }).sort({ createdAt: -1 });
    expect(ultima.label).toBeNull();
  });
});

// ===========================================================================
// POST /api/locations/friends — getFriendsLocations
// ===========================================================================

describe('POST /api/locations/friends', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/locations/friends')
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando faltan las coordenadas en el body', async () => {
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve lista vacía cuando el usuario no tiene amigos', async () => {
    // Arrange: friendsClient devuelve array vacío (valor por defecto del mock)
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    expect(res.status).toBe(200);
    expect(res.body.friends).toEqual([]);
  });

  it('devuelve lista vacía cuando un amigo existe en el sistema pero no registró su ubicación', async () => {
    // Arrange: USER_B es amigo pero no tiene ningún documento en Location
    friendsClient.getFriendIds.mockResolvedValue([USER_B]);
    usersClient.getUserProfiles.mockResolvedValue([{ id: USER_B, username: 'user-b-name' }]);
    // No se crea ningún Location para USER_B

    // Act
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert: la aggregation no encuentra documentos y devuelve array vacío
    expect(res.status).toBe(200);
    expect(res.body.friends).toEqual([]);
  });

  it('devuelve las ubicaciones de los amigos ordenadas por distancia ascendente', async () => {
    // Arrange
    friendsClient.getFriendIds.mockResolvedValue([USER_B, USER_C]);
    usersClient.getUserProfiles.mockResolvedValue([
      { id: USER_B, username: 'user-b-name' },
      { id: USER_C, username: 'user-c-name' },
    ]);
    await Location.create([
      { userId: USER_C, latitude: LAT_LEJOS, longitude: LON_LEJOS }, // ~150 km
      { userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA }, // ~144 m
    ]);

    // Act
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert: orden ascendente por distancia
    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(2);
    expect(res.body.friends[0].userId).toBe(USER_B); // más cercano primero
    expect(res.body.friends[1].userId).toBe(USER_C);
    expect(res.body.friends[0].username).toBe('user-b-name');
    expect(res.body.friends[0].distanceMeters).toBeLessThan(200);
  });

  it('excluye amigos con modo privado activo — verificado con aggregation real de MongoDB ($lookup)', async () => {
    // Arrange: USER_B y USER_C son amigos, pero USER_B activó el modo privado.
    // getUserProfiles devuelve ambos perfiles (como haría el users service real al recibir
    // [USER_B, USER_C]); el filtrado lo hace el $lookup en MongoDB, no el mock.
    friendsClient.getFriendIds.mockResolvedValue([USER_B, USER_C]);
    usersClient.getUserProfiles.mockResolvedValue([
      { id: USER_B, username: 'user-b-name' },
      { id: USER_C, username: 'user-c-name' },
    ]);
    await Location.create([
      { userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA },
      { userId: USER_C, latitude: LAT_CERCA, longitude: LON_CERCA },
    ]);
    await LocationPrivacy.create({ userId: USER_B, isPrivate: true });

    // Act
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert: solo USER_C (público) aparece — el $lookup filtró a USER_B en la DB
    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.friends[0].userId).toBe(USER_C);
  });

  it('incluye al amigo cuyo isPrivate fue explícitamente seteado a false', async () => {
    // Arrange: USER_B tiene registro de privacidad en false (público explícito)
    friendsClient.getFriendIds.mockResolvedValue([USER_B]);
    usersClient.getUserProfiles.mockResolvedValue([{ id: USER_B, username: 'user-b-name' }]);
    await Location.create({ userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA });
    await LocationPrivacy.create({ userId: USER_B, isPrivate: false });

    // Act
    const res = await request(app)
      .post('/api/locations/friends')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(1);
  });
});

// ===========================================================================
// PATCH /api/locations/privacy — setPrivacyStatus
// ===========================================================================

describe('PATCH /api/locations/privacy', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .patch('/api/locations/privacy')
      .send({ isPrivate: true });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando falta el campo isPrivate en el body', async () => {
    const res = await request(app)
      .patch('/api/locations/privacy')
      .set(authHeader(tokenA))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('activa el modo privado, lo persiste en MongoDB y sincroniza con usersClient', async () => {
    // Act
    const res = await request(app)
      .patch('/api/locations/privacy')
      .set(authHeader(tokenA))
      .send({ isPrivate: true });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body.isPrivate).toBe(true);

    // Assert: sincronización con el servicio externo
    expect(usersClient.updateUserPrivacy).toHaveBeenCalledWith(USER_A, true);

    // Assert DB
    const registro = await LocationPrivacy.findOne({ userId: USER_A });
    expect(registro.isPrivate).toBe(true);
  });

  it('desactiva el modo privado y actualiza el registro en MongoDB', async () => {
    // Arrange: usuario ya tiene modo privado activo
    await LocationPrivacy.create({ userId: USER_A, isPrivate: true });

    // Act
    const res = await request(app)
      .patch('/api/locations/privacy')
      .set(authHeader(tokenA))
      .send({ isPrivate: false });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body.isPrivate).toBe(false);

    // Assert DB
    const registro = await LocationPrivacy.findOne({ userId: USER_A });
    expect(registro.isPrivate).toBe(false);
  });
});

// ===========================================================================
// GET /api/locations/privacy — getPrivacyStatus
// ===========================================================================

describe('GET /api/locations/privacy', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/locations/privacy');

    expect(res.status).toBe(401);
  });

  it('devuelve isPrivate: false cuando no existe registro (público por defecto)', async () => {
    // Arrange: DB vacía tras deleteMany
    const res = await request(app)
      .get('/api/locations/privacy')
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.isPrivate).toBe(false);
  });

  it('devuelve isPrivate: true después de activar el modo privado', async () => {
    // Arrange
    await LocationPrivacy.create({ userId: USER_A, isPrivate: true });

    // Act
    const res = await request(app)
      .get('/api/locations/privacy')
      .set(authHeader(tokenA));

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.isPrivate).toBe(true);
  });
});

// ===========================================================================
// POST /api/locations/radar — getRadar
// ===========================================================================

describe('POST /api/locations/radar', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/locations/radar')
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando faltan las coordenadas en el body', async () => {
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve lista vacía cuando no hay usuarios cercanos', async () => {
    // Arrange: DB vacía
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('devuelve usuarios públicos cercanos que no son amigos, ordenados por distancia', async () => {
    // Arrange
    usersClient.getUserProfiles.mockResolvedValue([
      { id: USER_B, username: 'user-b-name' },
    ]);
    await Location.create({ userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA });

    // Act
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].userId).toBe(USER_B);
    expect(res.body.users[0].username).toBe('user-b-name');
    expect(res.body.users[0].distanceMeters).toBeLessThan(200);
  });

  it('excluye usuarios con modo privado activo — verificado con aggregation real de MongoDB ($lookup)', async () => {
    // Arrange: USER_B privado, USER_C público — ambos cerca.
    // El $lookup filtra a USER_B en MongoDB antes de que el service llame a getUserProfiles,
    // así que el mock solo recibe [USER_C] como candidato. Lo modelamos devolviendo ambos perfiles
    // para que el join sea fiel a la realidad: si el mock devolviera solo USER_C y el $lookup
    // dejara de funcionar, el resultado sería incorrecto de todas formas.
    usersClient.getUserProfiles.mockResolvedValue([
      { id: USER_B, username: 'user-b-name' },
      { id: USER_C, username: 'user-c-name' },
    ]);
    await Location.create([
      { userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA },
      { userId: USER_C, latitude: LAT_CERCA, longitude: LON_CERCA },
    ]);
    await LocationPrivacy.create({ userId: USER_B, isPrivate: true });

    // Act
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert: solo USER_C aparece — el $lookup filtró a USER_B antes del join de perfiles
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].userId).toBe(USER_C);
  });

  it('excluye amigos del resultado del radar', async () => {
    // Arrange: USER_B es amigo de USER_A
    friendsClient.getFriendIds.mockResolvedValue([USER_B]);
    await Location.create({ userId: USER_B, latitude: LAT_CERCA, longitude: LON_CERCA });

    // Act
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert: el radar no incluye amigos, ni siquiera llama a getUserProfiles
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    expect(usersClient.getUserProfiles).not.toHaveBeenCalled();
  });

  it('excluye al propio usuario del resultado del radar', async () => {
    // Arrange: el usuario tiene ubicación registrada
    await Location.create({ userId: USER_A, latitude: LAT_CERCA, longitude: LON_CERCA });

    // Act
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('excluye usuarios fuera del radio de búsqueda configurado en las preferencias', async () => {
    // Arrange: radio de 1 km, USER_B está a ~150 km
    usersClient.getPreferences.mockResolvedValue({ search_radius_km: 1 });
    await Location.create({ userId: USER_B, latitude: LAT_LEJOS, longitude: LON_LEJOS });

    // Act
    const res = await request(app)
      .post('/api/locations/radar')
      .set(authHeader(tokenA))
      .send({ latitude: LAT_CENTER, longitude: LON_CENTER });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });
});

// ===========================================================================
// PUT /api/locations/label — updateLabel
// ===========================================================================

describe('PUT /api/locations/label', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .put('/api/locations/label')
      .send({ label: 'Facultad' });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando el usuario aún no registró su ubicación', async () => {
    // Arrange: DB vacía — no hay Location para USER_A
    const res = await request(app)
      .put('/api/locations/label')
      .set(authHeader(tokenA))
      .send({ label: 'Facultad' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('devuelve 200 y persiste la etiqueta en MongoDB', async () => {
    // Arrange: ubicación previa existe
    await Location.create({ userId: USER_A, latitude: LAT_CENTER, longitude: LON_CENTER });

    // Act
    const res = await request(app)
      .put('/api/locations/label')
      .set(authHeader(tokenA))
      .send({ label: 'Facultad' });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Etiqueta actualizada' });

    // Assert DB
    const doc = await Location.findOne({ userId: USER_A });
    expect(doc.label).toBe('Facultad');
  });

  it('elimina tags HTML para prevenir XSS (CA.5)', async () => {
    // Arrange
    await Location.create({ userId: USER_A, latitude: LAT_CENTER, longitude: LON_CENTER });

    // Act: etiqueta con tag HTML embebido
    await request(app)
      .put('/api/locations/label')
      .set(authHeader(tokenA))
      .send({ label: '<b>Cafe</b>' })
      .expect(200);

    // Assert: solo el texto plano queda guardado
    const doc = await Location.findOne({ userId: USER_A });
    expect(doc.label).toBe('Cafe');
    expect(doc.label).not.toContain('<b>');
  });

  it('enviar label vacío ("") limpia la etiqueta existente — mismo efecto que DELETE', async () => {
    // Arrange: ubicación con etiqueta activa
    await Location.create({
      userId: USER_A,
      latitude: LAT_CENTER,
      longitude: LON_CENTER,
      label: 'Biblioteca',
      labelLatitude: LAT_CENTER,
      labelLongitude: LON_CENTER,
      labelCreatedAt: new Date(),
    });

    // Act: label vacío en el body
    const res = await request(app)
      .put('/api/locations/label')
      .set(authHeader(tokenA))
      .send({ label: '' });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Etiqueta eliminada' });

    // Assert DB: la etiqueta fue seteada a null
    const doc = await Location.findOne({ userId: USER_A });
    expect(doc.label).toBeNull();
  });
});

// ===========================================================================
// DELETE /api/locations/label — deleteLabel
// ===========================================================================

describe('DELETE /api/locations/label', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).delete('/api/locations/label');

    expect(res.status).toBe(401);
  });

  it('devuelve 400 cuando el usuario aún no registró su ubicación', async () => {
    // Arrange: DB vacía
    const res = await request(app)
      .delete('/api/locations/label')
      .set(authHeader(tokenA));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('devuelve 200 y setea la etiqueta a null en MongoDB', async () => {
    // Arrange: ubicación con etiqueta existente
    await Location.create({
      userId: USER_A,
      latitude: LAT_CENTER,
      longitude: LON_CENTER,
      label: 'Biblioteca',
      labelLatitude: LAT_CENTER,
      labelLongitude: LON_CENTER,
      labelCreatedAt: new Date(),
    });

    // Act
    const res = await request(app)
      .delete('/api/locations/label')
      .set(authHeader(tokenA));

    // Assert HTTP
    expect(res.status).toBe(200);

    // Assert DB: la etiqueta fue eliminada
    const doc = await Location.findOne({ userId: USER_A });
    expect(doc.label).toBeNull();
  });
});
