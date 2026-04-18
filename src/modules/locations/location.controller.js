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
};

module.exports = { locationController };
