import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "@prisma";
import { LoginRequest, RegisterRequest, AuthResponse } from "@types";
import type { CardSkin } from "@blurtz/shared";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(registerRequest: RegisterRequest): Promise<AuthResponse> {
    const { username, password } = registerRequest;

    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException("Username already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const savedUser = await this.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    const payload = { username: savedUser.username, sub: savedUser.id };
    const token = this.jwtService.sign(payload);

    const { password: _, ...userWithoutPassword } = savedUser;

    this.logger.log(`User registered: ${savedUser.id} (${savedUser.username})`);
    return {
      user: userWithoutPassword,
      token,
    };
  }

  async login(loginRequest: LoginRequest): Promise<AuthResponse> {
    const { username, password } = loginRequest;

    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const payload = { username: user.username, sub: user.id };
    const token = this.jwtService.sign(payload);

    this.logger.log(`User logged in: ${user.id} (${user.username})`);
    return {
      user,
      token,
    };
  }

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * The columns a profile is allowed to carry. Shared by every read and write
   * of a profile so the two cannot drift - a route that returns `cardSkin` and
   * another that does not would leave the client defaulting to solid forever.
   */
  private readonly profileSelect = {
    id: true,
    username: true,
    gamesPlayed: true,
    gamesWon: true,
    cardSkin: true,
    createdAt: true,
  };

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: this.profileSelect,
    });
  }

  async updatePreferences(id: string, preferences: { cardSkin: CardSkin }) {
    return this.prisma.user.update({
      where: { id },
      data: { cardSkin: preferences.cardSkin },
      select: this.profileSelect,
    });
  }
}
