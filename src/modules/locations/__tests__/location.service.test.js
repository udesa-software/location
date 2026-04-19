const { locationService } = require('../location.service');
const { locationRepository } = require('../location.repository');
const { friendsClient } = require('../../../clients/friendsClient');

jest.mock('../location.repository', () => ({
  locationRepository: {
    findLastByUser: jest.fn(),
    findLastByUsers: jest.fn(),
    save: jest.fn(),
    updateLabel: jest.fn(),
  },
}));

jest.mock('../../../clients/friendsClient', () => ({
  friendsClient: {
    getFriendIds: jest.fn(),
  },
}));

jest.mock('../../../config/env', () => ({
  env: { MIN_UPDATE_INTERVAL_SECONDS: '60', FRIENDS_SERVICE_URL: 'http://friends:3001' },
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
