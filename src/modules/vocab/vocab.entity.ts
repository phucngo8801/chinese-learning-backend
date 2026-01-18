// src/modules/vocab/vocab.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('vocabs')
export class Vocab {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ length: 10 })
  zh: string; // chữ Trung

  @Column({ length: 50 })
  pinyin: string; // ming2 tian1

  @Column({ length: 100 })
  vi: string; // nghĩa Việt

  @Column({ default: 1 })
  level: number; // độ khó
}
