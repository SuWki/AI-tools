import type { Lang } from '../types';
export interface FieldDefinition { key:string; zh:string; en:string }
export interface Scenario { id:string; zh:string; en:string; fields:FieldDefinition[] }
export interface BusinessProfile { nameZh:string; nameEn:string; noticeZh:string; noticeEn:string; scenarios:Scenario[] }
export interface FieldValue { value:string; source:string; status:'missing'|'unverified'|'confirmed'; actorId?:string; at?:number }
export interface Evidence { id:string; sku:string; name:string; summary:string; source:string; version:number }
export interface ReplyVersion { id:string; version:number; body:string; lang:Lang; risk:'clarification'|'technical'|'commercial'|'aftersales'; status:'draft'|'pending'|'approved'|'rejected'|'stale'|'sent'; authorId:string; authorName:string; reviewerId?:string; reviewerName?:string; reviewNote?:string; reviewedAt?:number; sentAt?:number; channel?:string; createdAt:number; fields:Record<string,FieldValue>; evidence:Evidence[] }
export interface FollowUpTask { id:string; title:string; assigneeId:string; dueAt:number; timeZone:string; status:'open'|'done'|'cancelled'; result?:string; createdAt:number; completedAt?:number }
export interface WorkflowEvent { id:string; action:string; detail:string; actor:string; at:number }
export interface Workflow { revision:number; scenario:string; fields:Record<string,FieldValue>; evidence:Evidence[]; replies:ReplyVersion[]; tasks:FollowUpTask[]; events:WorkflowEvent[]; result:string; conclusion?:string; closedAt?:number }
export interface Member { id:string; name:string; role:string }
export type Command = { op:string; revision?:number; [key:string]:unknown };
export interface InboxItem { id:string; kind:'tasks'|'replies'; caseId:string; topic:string; title?:string; dueAt?:number; version?:number; status:string; createdAt:number }
