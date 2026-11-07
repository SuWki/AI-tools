import type { Lang } from '../types';
export const wording=(lang:Lang,zh:string,en:string)=>lang==='zh'?zh:en;
const messages:Record<string,[string,string]>={
  REVISION_CONFLICT:['记录已被修改，请重新加载后合并你的输入。','This record changed. Reload and merge your input.'],
  WORKSPACE_CHANGED:['工作空间已变化，请重新加载。','Workspace changed. Please reload.'],
  INVALID_INPUT:['请补齐必填信息并检查长度。','Check required fields and text length.'],
  MISSING_CONFIRMED_FIELDS:['请先确认场景必填字段，并记录信息来源。','Confirm required fields and record their sources first.'],
  CONFIRMATION_SOURCE_REQUIRED:['已确认字段必须有值和来源。','Confirmed fields require a value and source.'],
  EVIDENCE_REQUIRED:['请引用当前企业已审核资料。','Reference approved evidence from this workspace.'],
  EVIDENCE_CHANGED:['引用资料已变化或失效，请重新核验。','Evidence changed or is unavailable. Revalidate it.'],
  APPROVAL_REQUIRED:['当前版本尚未核准。','This version is not approved.'],
  SELF_APPROVAL_FORBIDDEN:['承诺类回复不能由作者自批。','Authors cannot approve their own commitments.'],
  REVIEW_AUTHORITY_REQUIRED:['请选择具备相应授权的审核人。','An appropriately authorised reviewer is required.'],
  OPEN_TASKS:['请先完成或取消未完成任务，并记录结果或理由。','Resolve or cancel all open tasks with an outcome first.'],
  PENDING_APPROVAL:['请先处理待审核回复。','Resolve pending approvals first.'],
  FOLLOWUP_REQUIRED:['等待状态必须有关联的下一次跟进任务。','A waiting case requires an open follow-up task.'],
  CASE_CLOSED:['工单已结案，修改前请填写原因重开。','Reopen the closed case with a reason before editing.'],
  INVALID_TRANSITION:['当前状态不允许此操作，请刷新查看最新记录。','This action is unavailable in the current state. Reload first.'],
  INVALID_TIME:['请检查日期，实际发送时间不能在未来。','Check the date. Actual dispatch cannot be in the future.'],
  INVALID_ASSIGNEE:['负责人必须属于当前企业。','Assignee must belong to the current workspace.'],
  EXPORT_FORBIDDEN:['当前账号没有明细导出权限。','This account cannot export detailed records.'],
  REPLY_SUPERSEDED:['该版本已被后续草稿替代。','This version has been superseded.'],
  UNRESOLVED_PLACEHOLDER:['请先替换正文中的未完成占位符。','Resolve placeholders in the reply first.'],
  EDITOR_REQUIRED:['仅工单负责人或管理员可修改。','Only the case owner or administrator may edit.'],
  TASK_ASSIGNEE_REQUIRED:['仅任务执行人或工单负责人可处理。','Only the assignee or case owner may resolve this task.'],
  ALREADY_SENT:['此版本已经登记发送。','This version already has a dispatch record.'],
  SERVER_ERROR:['服务暂时无法处理，请稍后重试。','The server could not complete the request. Please retry.']
};
export function errorMessage(lang:Lang,error:unknown){const raw=error instanceof Error?error.message:String(error);return messages[raw]?.[lang==='zh'?0:1]??raw;}
const states:Record<string,[string,string]>={open:['待处理','Open'],progress:['处理中','In progress'],done:['已完成','Done'],waiting_customer:['等待客户','Waiting for customer'],waiting_internal:['等待内部','Waiting internally'],draft:['草稿','Draft'],pending:['待审核','Pending'],approved:['已核准','Approved'],rejected:['退回修改','Changes requested'],stale:['需重新核验','Revalidation required'],sent:['已登记发送','Dispatch recorded'],missing:['待询问','Missing'],unverified:['待核验','Unverified'],confirmed:['已确认','Confirmed'],cancelled:['已取消','Cancelled'],order:['已转订单','Transferred to order'],answered:['已解答','Answered'],lost:['未成交','Lost'],deferred:['客户暂缓','Deferred'],invalid:['无效/重复','Invalid / duplicate']};
export const stateLabel=(lang:Lang,key:string)=>states[key]?.[lang==='zh'?0:1]??key;
