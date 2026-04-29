const { locationService } = require('../location.service');
const { locationRepository } = require('../location.repository');
const { friendsClient } = require('../../../clients/friendsClient');
const { usersClient } = require('../../../clients/usersClient');

jest.mock('../location.repository', () => ({
  locationRepository: {
    findLastByUser: jest.fn(),
    findLastByUsers: jest.fn(),
    findNearbyUsers: jest.fn(),
    findPrivacyByUser: jest.fn(),
    upsertPrivacy: jest.fn(),
    save: jest.fn(),
    updateLabel: jest.fn(),
  },
}));

jest.mock('../../../clients/friendsClient', () => ({
  friendsClient: {
    getFriendIds: jest.fn(),
  },
}));

jest.mock('../../../clients/usersClient', () => ({
  usersClient: {
    getUserProfiles: jest.fn(),
    updateUserPrivacy: jest.fn(),
    getPreferences: jest.fn(),
  },
}));

jest.mock('../../../config/env', () => ({
  env: {
    MIN_UPDATE_INTERVAL_SECONDS: '60',
    FRIENDS_SERVICE_URL: 'http://friends:3001',
    USERS_SERVICE_URL: 'http://users:3000',
  },
}));

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FRIEND_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VALID_COORDS = { latitude: -34.6037, longitude: -58.3816 };

describe('locationService.updateLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationRepository.findLastByUser.mockResolvedValue(null);
    locationRepository.save.mockResolvedValue({});
  });

  it('guarda la ubicación si no hay registros previos', async () => {
    const result = await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalledWith(
      USER_ID, VALID_COORDS.latitude, VALID_COORDS.longitude, null
    );
    expect(result).toEqual({ message: 'Ubicación actualizada' });
  });

  it('guarda la ubicación si el último envío fue hace más del intervalo mínimo', async () => {
    const hace2Minutos = new Date(Date.now() - 120 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace2Minutos });

    const result = await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Ubicación actualizada' });
  });

  // CA.4: rate limiting con env global
  it('lanza 429 si el último envío fue hace menos del intervalo mínimo', async () => {
    const hace10Segundos = new Date(Date.now() - 10 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace10Segundos });

    await expect(locationService.updateLocation(USER_ID, VALID_COORDS))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it('no guarda la ubicación si se supera la frecuencia (CA.4)', async () => {
    const hace10Segundos = new Date(Date.now() - 10 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace10Segundos });

    await expect(locationService.updateLocation(USER_ID, VALID_COORDS)).rejects.toThrow();
    expect(locationRepository.save).not.toHaveBeenCalled();
  });

  it('permite el envío exactamente en el límite del intervalo mínimo', async () => {
    const hace61Segundos = new Date(Date.now() - 61 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace61Segundos });

    await expect(locationService.updateLocation(USER_ID, VALID_COORDS)).resolves.toBeDefined();
    expect(locationRepository.save).toHaveBeenCalled();
  });

  it('usa el userId del JWT para guardar la ubicación', async () => {
    await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalledWith(
      USER_ID, expect.any(Number), expect.any(Number), null
    );
  });

  // CA.4: frecuencia personalizada del usuario
  it('respeta la frecuencia configurada por el usuario (locationUpdateFrequency)', async () => {
    // Con frecuencia de 15 min, debe rechazar si el último envío fue hace 5 min
    const hace5Minutos = new Date(Date.now() - 5 * 60 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace5Minutos });

    await expect(
      locationService.updateLocation(USER_ID, { ...VALID_COORDS, locationUpdateFrequency: 15 })
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('permite el envío si pasó suficiente tiempo según la frecuencia del usuario', async () => {
    // Con frecuencia de 5 min, debe permitir si el último envío fue hace 6 min
    const hace6Minutos = new Date(Date.now() - 6 * 60 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace6Minutos });

    await expect(
      locationService.updateLocation(USER_ID, { ...VALID_COORDS, locationUpdateFrequency: 5 })
    ).resolves.toEqual({ message: 'Ubicación actualizada' });
  });

  // H7 CA.4: etiqueta válida se transfiere al nuevo documento
  it('transfiere la etiqueta si sigue siendo válida al actualizar ubicación', async () => {
    const labelCreatedAt = new Date();
    locationRepository.findLastByUser.mockResolvedValue({
      createdAt: new Date(Date.now() - 120 * 1000),
      label: 'En la facu',
      labelLatitude: -34.6037,
      labelLongitude: -58.3816,
      labelCreatedAt,
    });

    await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalledWith(
      USER_ID,
      VALID_COORDS.latitude,
      VALID_COORDS.longitude,
      expect.objectContaining({ label: 'En la facu' })
    );
  });

  // H7 CA.4: etiqueta expirada (más de 6 horas) no se transfiere
  it('no transfiere la etiqueta si expiró por tiempo (CA.4)', async () => {
    const labelCreatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 horas atrás
    locationRepository.findLastByUser.mockResolvedValue({
      createdAt: new Date(Date.now() - 120 * 1000),
      label: 'Casa de Juan',
      labelLatitude: -34.6037,
      labelLongitude: -58.3816,
      labelCreatedAt,
    });

    await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalledWith(
      USER_ID, VALID_COORDS.latitude, VALID_COORDS.longitude, null
    );
  });
});

describe('locationService.getFriendsLocations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.getFriendIds.mockResolvedValue([FRIEND_ID]);
    locationRepository.findLastByUsers.mockResolvedValue([
      {
        _id: FRIEND_ID,
        latitude: -34.61,
        longitude: -58.39,
        label: null,
        labelCreatedAt: null,
        updatedAt: new Date(),
      },
    ]);
  });

  it('devuelve las ubicaciones de los amigos con distancia calculada', async () => {
    const result = await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(result.friends).toHaveLength(1);
    expect(result.friends[0].userId).toBe(FRIEND_ID);
    expect(result.friends[0].distanceMeters).toBeGreaterThan(0);
    expect(result.friends[0].distance).toMatch(/km|m/);
  });

  it('devuelve lista vacía si el usuario no tiene amigos', async () => {
    friendsClient.getFriendIds.mockResolvedValue([]);

    const result = await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(result.friends).toEqual([]);
    expect(locationRepository.findLastByUsers).not.toHaveBeenCalled();
  });

  // CA.2: solo devuelve amigos verificados por el servicio de friends
  it('consulta al servicio de friends para verificar amistades (CA.2)', async () => {
    await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(friendsClient.getFriendIds).toHaveBeenCalledWith(USER_ID);
  });

  it('devuelve lista vacía si los amigos no tienen ubicación registrada', async () => {
    locationRepository.findLastByUsers.mockResolvedValue([]);

    const result = await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(result.friends).toEqual([]);
  });

  // H7 CA.4: etiqueta expirada se omite en la respuesta
  it('oculta la etiqueta si expiró por tiempo en la respuesta a amigos (CA.4)', async () => {
    locationRepository.findLastByUsers.mockResolvedValue([
      {
        _id: FRIEND_ID,
        latitude: -34.61,
        longitude: -58.39,
        label: 'Casa de Juan',
        labelCreatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 horas atrás
        updatedAt: new Date(),
      },
    ]);

    const result = await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(result.friends[0].label).toBeNull();
  });

  // H7 CA.4: etiqueta vigente (menos de 6h) sí se muestra en la respuesta
  it('muestra la etiqueta si todavía está dentro de las 6 horas válidas (CA.4)', async () => {
    locationRepository.findLastByUsers.mockResolvedValue([
      {
        _id: FRIEND_ID,
        latitude: -34.61,
        longitude: -58.39,
        label: 'En la facu',
        labelCreatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 horas atrás (válida)
        updatedAt: new Date(),
      },
    ]);

    const result = await locationService.getFriendsLocations(USER_ID, VALID_COORDS);

    expect(result.friends[0].label).toBe('En la facu');
  });
});

// ---------------------------------------------------------------------------
// H5: setPrivacyStatus
// ---------------------------------------------------------------------------
describe('locationService.setPrivacyStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationRepository.upsertPrivacy.mockResolvedValue({});
    usersClient.updateUserPrivacy.mockResolvedValue(undefined);
  });

  it('llama a upsertPrivacy con el userId y isPrivate=true', async () => {
    await locationService.setPrivacyStatus(USER_ID, true);
    expect(locationRepository.upsertPrivacy).toHaveBeenCalledWith(USER_ID, true);
  });

  it('llama a upsertPrivacy con el userId y isPrivate=false', async () => {
    await locationService.setPrivacyStatus(USER_ID, false);
    expect(locationRepository.upsertPrivacy).toHaveBeenCalledWith(USER_ID, false);
  });

  // H5: sincroniza is_private al users service para filtrar el buscador
  it('sincroniza is_private=true al users service', async () => {
    await locationService.setPrivacyStatus(USER_ID, true);
    expect(usersClient.updateUserPrivacy).toHaveBeenCalledWith(USER_ID, true);
  });

  it('sincroniza is_private=false al users service', async () => {
    await locationService.setPrivacyStatus(USER_ID, false);
    expect(usersClient.updateUserPrivacy).toHaveBeenCalledWith(USER_ID, false);
  });

  // CA.1: activar modo privado
  it('devuelve mensaje "Modo privado activado" e isPrivate=true al activar', async () => {
    const result = await locationService.setPrivacyStatus(USER_ID, true);
    expect(result).toEqual({ message: 'Modo privado activado', isPrivate: true });
  });

  // CA.2: desactivar modo privado
  it('devuelve mensaje "Modo privado desactivado" e isPrivate=false al desactivar', async () => {
    const result = await locationService.setPrivacyStatus(USER_ID, false);
    expect(result).toEqual({ message: 'Modo privado desactivado', isPrivate: false });
  });

  // CA.3: cambio inmediato (upsertPrivacy llamado exactamente una vez)
  it('CA.3: persiste el cambio en la misma llamada (upsertPrivacy invocado una sola vez)', async () => {
    await locationService.setPrivacyStatus(USER_ID, true);
    expect(locationRepository.upsertPrivacy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// H5: getPrivacyStatus
// ---------------------------------------------------------------------------
describe('locationService.getPrivacyStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('devuelve isPrivate: false si el usuario nunca configuró privacidad (default público)', async () => {
    locationRepository.findPrivacyByUser.mockResolvedValue(null);
    const result = await locationService.getPrivacyStatus(USER_ID);
    expect(result).toEqual({ isPrivate: false });
  });

  it('devuelve isPrivate: true si el usuario tiene modo privado activo', async () => {
    locationRepository.findPrivacyByUser.mockResolvedValue({ userId: USER_ID, isPrivate: true });
    const result = await locationService.getPrivacyStatus(USER_ID);
    expect(result).toEqual({ isPrivate: true });
  });

  it('devuelve isPrivate: false si el usuario tiene modo privado explícitamente desactivado', async () => {
    locationRepository.findPrivacyByUser.mockResolvedValue({ userId: USER_ID, isPrivate: false });
    const result = await locationService.getPrivacyStatus(USER_ID);
    expect(result).toEqual({ isPrivate: false });
  });

  it('consulta el repositorio con el userId correcto', async () => {
    locationRepository.findPrivacyByUser.mockResolvedValue(null);
    await locationService.getPrivacyStatus(USER_ID);
    expect(locationRepository.findPrivacyByUser).toHaveBeenCalledWith(USER_ID);
  });
});

// ---------------------------------------------------------------------------
// H6: getRadar
// ---------------------------------------------------------------------------
describe('locationService.getRadar', () => {
  // Posición del usuario que hace el radar (Buenos Aires centro)
  const MY_COORDS = { latitude: -34.6037, longitude: -58.3816 };

  // Usuario a ~200m — dentro del radio de 1km
  const NEAR_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const NEAR_USER_COORDS = { latitude: -34.605, longitude: -58.383 };

  // Usuario a ~2.5km — fuera del radio de 1km pero dentro del bounding box
  const FAR_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const FAR_USER_COORDS = { latitude: -34.62, longitude: -58.40 };

  beforeEach(() => {
    jest.clearAllMocks();
    friendsClient.getFriendIds.mockResolvedValue([FRIEND_ID]);
    usersClient.getPreferences.mockResolvedValue({ search_radius_km: 1 });
    locationRepository.findNearbyUsers.mockResolvedValue([
      { _id: NEAR_USER_ID, ...NEAR_USER_COORDS },
    ]);
    usersClient.getUserProfiles.mockResolvedValue([
      { id: NEAR_USER_ID, username: 'usuario_cercano' },
    ]);
  });

  // CA.1: consulta al servicio de friends para obtener los IDs a excluir
  it('CA.1: llama a friendsClient.getFriendIds para obtener los amigos a excluir', async () => {
    await locationService.getRadar(USER_ID, MY_COORDS);
    expect(friendsClient.getFriendIds).toHaveBeenCalledWith(USER_ID);
  });

  it('excluye al propio usuario y a sus amigos de la búsqueda', async () => {
    await locationService.getRadar(USER_ID, MY_COORDS);
    expect(locationRepository.findNearbyUsers).toHaveBeenCalledWith(
      MY_COORDS.latitude,
      MY_COORDS.longitude,
      1, // search_radius_km del mock de getPreferences
      expect.arrayContaining([USER_ID, FRIEND_ID])
    );
  });

  // CA.2: el radio viene de las preferencias del usuario, no del cliente
  it('CA.2: usa el radio de preferencias del usuario (no del body del cliente)', async () => {
    usersClient.getPreferences.mockResolvedValue({ search_radius_km: 25 });
    await locationService.getRadar(USER_ID, MY_COORDS);
    expect(usersClient.getPreferences).toHaveBeenCalledWith(USER_ID);
    expect(locationRepository.findNearbyUsers).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 25, expect.any(Array)
    );
  });

  it('devuelve lista vacía si no hay usuarios cercanos', async () => {
    locationRepository.findNearbyUsers.mockResolvedValue([]);
    const result = await locationService.getRadar(USER_ID, MY_COORDS);
    expect(result).toEqual({ users: [] });
    expect(usersClient.getUserProfiles).not.toHaveBeenCalled();
  });

  it('devuelve lista vacía si el usuario sin amigos no tiene vecinos', async () => {
    friendsClient.getFriendIds.mockResolvedValue([]);
    locationRepository.findNearbyUsers.mockResolvedValue([]);
    const result = await locationService.getRadar(USER_ID, MY_COORDS);
    expect(result).toEqual({ users: [] });
  });

  // Filtro exacto por Haversine: el bounding box puede incluir usuarios fuera del radio real
  it('filtra usuarios que están fuera del radio exacto (más allá del bounding box grueso)', async () => {
    locationRepository.findNearbyUsers.mockResolvedValue([
      { _id: NEAR_USER_ID, ...NEAR_USER_COORDS },   // ~200m → dentro del radio 1km
      { _id: FAR_USER_ID, ...FAR_USER_COORDS },     // ~2.5km → fuera del radio 1km
    ]);
    usersClient.getUserProfiles.mockResolvedValue([
      { id: NEAR_USER_ID, username: 'usuario_cercano' },
      { id: FAR_USER_ID, username: 'usuario_lejano' },
    ]);

    const result = await locationService.getRadar(USER_ID, MY_COORDS);

    const ids = result.users.map((u) => u.userId);
    expect(ids).toContain(NEAR_USER_ID);
    expect(ids).not.toContain(FAR_USER_ID);
  });

  it('llama a usersClient.getUserProfiles con los userIds de los usuarios dentro del radio', async () => {
    await locationService.getRadar(USER_ID, MY_COORDS);
    expect(usersClient.getUserProfiles).toHaveBeenCalledWith([NEAR_USER_ID]);
  });

  it('incluye userId, username, distance y distanceMeters en cada resultado', async () => {
    const result = await locationService.getRadar(USER_ID, MY_COORDS);

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      userId: NEAR_USER_ID,
      username: 'usuario_cercano',
      distanceMeters: expect.any(Number),
      distance: expect.stringMatching(/km|m/),
    });
  });

  it('devuelve distanceMeters positivo para usuarios cercanos', async () => {
    const result = await locationService.getRadar(USER_ID, MY_COORDS);
    expect(result.users[0].distanceMeters).toBeGreaterThan(0);
  });

  it('ordena los resultados por distancia ascendente', async () => {
    // Dos usuarios dentro del radio, uno más cerca que el otro
    const VERY_NEAR_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    locationRepository.findNearbyUsers.mockResolvedValue([
      { _id: NEAR_USER_ID, latitude: -34.607, longitude: -58.383 },   // ~400m
      { _id: VERY_NEAR_ID, latitude: -34.604, longitude: -58.382 },   // ~100m
    ]);
    usersClient.getUserProfiles.mockResolvedValue([
      { id: NEAR_USER_ID, username: 'segundo' },
      { id: VERY_NEAR_ID, username: 'primero' },
    ]);

    const result = await locationService.getRadar(USER_ID, MY_COORDS);

    expect(result.users[0].distanceMeters).toBeLessThanOrEqual(result.users[1].distanceMeters);
  });

  it('omite usuarios que no tienen perfil en el servicio de users', async () => {
    const UNKNOWN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    locationRepository.findNearbyUsers.mockResolvedValue([
      { _id: NEAR_USER_ID, ...NEAR_USER_COORDS },
      { _id: UNKNOWN_ID, ...NEAR_USER_COORDS },
    ]);
    // users service solo devuelve perfil de NEAR_USER_ID
    usersClient.getUserProfiles.mockResolvedValue([
      { id: NEAR_USER_ID, username: 'usuario_cercano' },
    ]);

    const result = await locationService.getRadar(USER_ID, MY_COORDS);

    const ids = result.users.map((u) => u.userId);
    expect(ids).toContain(NEAR_USER_ID);
    expect(ids).not.toContain(UNKNOWN_ID);
  });
});

describe('locationService.updateLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationRepository.findLastByUser.mockResolvedValue({
      ...VALID_COORDS,
      createdAt: new Date(),
    });
    locationRepository.updateLabel.mockResolvedValue({});
  });

  it('guarda la etiqueta sanitizada', async () => {
    await locationService.updateLabel(USER_ID, { label: 'En la facu' });

    expect(locationRepository.updateLabel).toHaveBeenCalledWith(
      USER_ID, 'En la facu', VALID_COORDS.latitude, VALID_COORDS.longitude
    );
  });

  // CA.5: sanitización HTML
  it('elimina tags HTML de la etiqueta (CA.5)', async () => {
    await locationService.updateLabel(USER_ID, { label: '<b>En la facu</b>' });

    expect(locationRepository.updateLabel).toHaveBeenCalledWith(
      USER_ID, 'En la facu', expect.any(Number), expect.any(Number)
    );
  });

  // CA.3: borrar etiqueta con null
  it('borra la etiqueta si se pasa null (CA.3)', async () => {
    await locationService.updateLabel(USER_ID, { label: null });

    expect(locationRepository.updateLabel).toHaveBeenCalledWith(
      USER_ID, null, expect.any(Number), expect.any(Number)
    );
  });

  // CA.3: borrar etiqueta con string vacío
  it('borra la etiqueta si se pasa string vacío (CA.3)', async () => {
    await locationService.updateLabel(USER_ID, { label: '' });

    expect(locationRepository.updateLabel).toHaveBeenCalledWith(
      USER_ID, null, expect.any(Number), expect.any(Number)
    );
  });

  it('lanza 400 si el usuario no tiene ubicación registrada', async () => {
    locationRepository.findLastByUser.mockResolvedValue(null);

    await expect(locationService.updateLabel(USER_ID, { label: 'En la facu' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna mensaje de actualización cuando hay etiqueta', async () => {
    const result = await locationService.updateLabel(USER_ID, { label: 'En la facu' });
    expect(result.message).toBe('Etiqueta actualizada');
  });

  it('retorna mensaje de eliminación cuando label es null', async () => {
    const result = await locationService.updateLabel(USER_ID, { label: null });
    expect(result.message).toBe('Etiqueta eliminada');
  });
});
