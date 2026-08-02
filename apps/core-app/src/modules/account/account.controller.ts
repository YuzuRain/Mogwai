import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  createKeyRequestSchema,
  createTokenResponseSchema,
  paginatedSchema,
  platformTokenSchema,
  profileSchema,
  providerKeySchema,
  updateKeyRequestSchema,
  updateProfileRequestSchema,
} from "@mogwai/shared";

import { SessionGuard, type AuthedRequest } from "../../auth/session.guard.js";
import { parseRequest, toDto } from "../../common/zod.js";
import { AccountService } from "./account.service.js";

/**
 * account 管理面(architecture B4.1)。响应一律先过 shared DTO schema(toDto),
 * 服务端违约当场 500,契约与实现永不静默脱节。
 */
@Controller("api/v1/account")
@UseGuards(SessionGuard)
export class AccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  @Get("profile")
  async getProfile(@Req() req: AuthedRequest) {
    return toDto(profileSchema, await this.account.getProfile(req.userId));
  }

  @Patch("profile")
  async updateProfile(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { privacy_mode } = parseRequest(updateProfileRequestSchema, body);
    return toDto(profileSchema, await this.account.updatePrivacyMode(req.userId, privacy_mode));
  }

  @Get("tokens")
  async listTokens(@Req() req: AuthedRequest) {
    return toDto(paginatedSchema(platformTokenSchema), {
      items: await this.account.listTokens(req.userId),
      next_cursor: null,
    });
  }

  @Post("tokens")
  async createToken(@Req() req: AuthedRequest) {
    return toDto(createTokenResponseSchema, await this.account.createToken(req.userId));
  }

  @Delete("tokens/:id")
  @HttpCode(204)
  async revokeToken(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.account.revokeToken(req.userId, id);
  }

  @Get("keys")
  async listKeys(@Req() req: AuthedRequest) {
    return toDto(paginatedSchema(providerKeySchema), {
      items: await this.account.listKeys(req.userId),
      next_cursor: null,
    });
  }

  @Post("keys")
  async createKey(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseRequest(createKeyRequestSchema, body);
    return toDto(providerKeySchema, await this.account.createKey(req.userId, input));
  }

  @Patch("keys/:id")
  async updateKey(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { model_whitelist } = parseRequest(updateKeyRequestSchema, body);
    return toDto(
      providerKeySchema,
      await this.account.updateKeyWhitelist(req.userId, id, model_whitelist),
    );
  }

  @Delete("keys/:id")
  @HttpCode(204)
  async revokeKey(@Req() req: AuthedRequest, @Param("id") id: string) {
    await this.account.revokeKey(req.userId, id);
  }
}
