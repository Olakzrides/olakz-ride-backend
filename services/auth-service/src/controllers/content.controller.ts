import { Request, Response, NextFunction } from 'express';
import contentService from '../services/content.service';
import ResponseUtil from '../utils/response';

class ContentController {
  async getContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key } = req.params;
      const data = await contentService.getContent(key);
      ResponseUtil.success(res, data, 'Content retrieved');
    } catch (error) { next(error); }
  }
}

export default new ContentController();
