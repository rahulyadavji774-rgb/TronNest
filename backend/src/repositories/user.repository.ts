import { BaseRepository } from './base.repository';

export class UserRepository extends BaseRepository<any> {
  private static instance: UserRepository;

  private constructor() {
    super('users');
  }

  public static getInstance(): UserRepository {
    if (!UserRepository.instance) {
      UserRepository.instance = new UserRepository();
    }
    return UserRepository.instance;
  }
}
