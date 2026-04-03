const { locationService } = require('../location.service');
const { locationRepository } = require('../location.repository');

jest.mock('../location.repository', () => ({
  locationRepository: {
    findLastByUser: jest.fn(),
    save: jest.fn(),
  },
}));

jest.mock('../../../config/env', () => ({
  env: { MIN_UPDATE_INTERVAL_SECONDS: '60' },
}));

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VALID_COORDS = { latitude: -34.6037, longitude: -58.3816 };

describe('locationService.updateLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationRepository.findLastByUser.mockResolvedValue(null);
    locationRepository.save.mockResolvedValue({});
  });

  it('guarda la ubicación si no hay registros previos', async () => {
    const result = await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalledWith(USER_ID, VALID_COORDS.latitude, VALID_COORDS.longitude);
    expect(result).toEqual({ message: 'Ubicación actualizada' });
  });

  it('guarda la ubicación si el último envío fue hace más del intervalo mínimo', async () => {
    const hace2Minutos = new Date(Date.now() - 120 * 1000);
    locationRepository.findLastByUser.mockResolvedValue({ createdAt: hace2Minutos });

    const result = await locationService.updateLocation(USER_ID, VALID_COORDS);

    expect(locationRepository.save).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Ubicación actualizada' });
  });

  // CA.4: rate limiting
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

    expect(locationRepository.save).toHaveBeenCalledWith(USER_ID, expect.any(Number), expect.any(Number));
  });
});
