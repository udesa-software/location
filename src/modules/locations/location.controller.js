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
};

module.exports = { locationController };
