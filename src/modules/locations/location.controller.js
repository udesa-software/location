const { locationService } = require('./location.service');

const locationController = {
  async updateLocation(req, res, next) {
    try {
      const result = await locationService.updateLocation(req.user.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H2: ubicaciones de amigos con distancia calculada
  async getFriendsLocations(req, res, next) {
    try {
      const result = await locationService.getFriendsLocations(req.user.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H5: activar/desactivar modo privado
  async setPrivacyStatus(req, res, next) {
    try {
      const result = await locationService.setPrivacyStatus(req.user.sub, req.body.isPrivate);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H5: consultar estado del modo privado
  async getPrivacyStatus(req, res, next) {
    try {
      const result = await locationService.getPrivacyStatus(req.user.sub);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H6: radar de usuarios cercanos no-amigos con modo privado desactivado
  async getRadar(req, res, next) {
    try {
      const result = await locationService.getRadar(req.user.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H7: crear/actualizar etiqueta de lugar manual
  async updateLabel(req, res, next) {
    try {
      const result = await locationService.updateLabel(req.user.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.3: borrar etiqueta
  async deleteLabel(req, res, next) {
    try {
      const result = await locationService.updateLabel(req.user.sub, { label: null });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H9: obtener el color de pin actual del usuario
  async getPinColor(req, res, next) {
    try {
      const result = await locationService.getPinColor(req.user.sub);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H9: actualizar el color del pin del usuario
  async updatePinColor(req, res, next) {
    try {
      const result = await locationService.updatePinColor(req.user.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // Obtener perfil detallado de amigo (biografía, presencia, historial de ubicaciones)
  async getFriendProfile(req, res, next) {
    try {
      const result = await locationService.getFriendProfile(req.user.sub, req.params.friendId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { locationController };
