import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { FriendsModule } from './modules/friends/friends.module';
import { StreakModule } from './modules/streak/streak.module';
import { ActivityModule } from './modules/activity/activity.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AuthModule } from './modules/auth/auth.module';
import { SharedAuthModule } from './shared/auth/auth.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { TranslateModule } from './modules/translate/translate.module';
import { VocabModule } from './modules/vocab/vocab.module';
import { StudyModule } from './modules/study/study.module';
import { ChatModule } from './modules/chat/chat.module';

@Module({
  imports: [
    PrismaModule,
    SharedAuthModule,   // <= MUST IMPORT
    AuthModule,
    UsersModule,
    FriendsModule,
    StreakModule,
    ActivityModule,
    LeaderboardModule,
    NotificationModule,
    LessonsModule,
    TranslateModule,
    VocabModule,
    StudyModule,
    ChatModule,
  ],
})
export class AppModule {}
