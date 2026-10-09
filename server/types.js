// Tipos compartilhados do servidor (JSDoc). Este módulo não tem código em tempo de execução: serve apenas para
// `import('../types.js').Nome` nas anotações dos arquivos com `// @ts-check` (veja tsconfig.server.json).

/** @typedef {import('pg').Pool} Pool */
/** @typedef {import('pg').PoolClient} PoolClient */
/** Pool ou cliente de transação: ambos oferecem `query`. */
/** @typedef {Pool | PoolClient} Queryable */

/** Usuário autenticado, como `request.auth`. */
/** @typedef {{ id: string, name: string, email: string, role: string, spaceId: string }} AuthUser */

/** Resultado de uma operação de sincronização: status HTTP e corpo JSON. */
/** @typedef {{ status: number, body: Record<string, unknown> }} OperationResult */

/** Valores em centavos trafegam como inteiro seguro (JSON) ou texto (colunas bigint). */
/** @typedef {number | string} Cents */

/** Competência no formato AAAA-MM. */
/** @typedef {string} MonthString */

/** Linha de lançamento financeiro devolvida pelas consultas. */
/**
 * @typedef {object} EntryRow
 * @property {string} id
 * @property {'income' | 'expense' | 'investment'} kind
 * @property {string} description
 * @property {string | null} category_id
 * @property {string | null} [category_name]
 * @property {string} competence_on
 * @property {string | null} due_on
 * @property {string} planned_cents
 * @property {string | null} actual_cents
 * @property {string | null} realized_on
 * @property {string | null} payment_method_id
 * @property {string | null} [payment_method_name]
 * @property {number} version
 */

export {};
