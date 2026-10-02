import { Model, type InitOptions } from 'sequelize';

/**
 * Shared model conventions for every table in this schema:
 *
 *  - `underscored: true`  -> PostgreSQL columns are snake_case
 *  - `freezeTableName`    -> no implicit pluralisation
 *  - `timestamps`         -> created_at / updated_at
 *  - DECIMAL columns come back from pg as STRINGS (dialectOptions
 *    decimalNumbers:false), so the driver never introduces float rounding.
 *    Services parse them with src/utils/money.ts (Decimal.js).
 *
 * `decimalAttributes` lists the money/percentage attributes that `toJSON()`
 * converts to JS numbers. The frontend expects camelCase keys with numeric
 * values in JSON responses (see frontend/src/database/databaseTypes.ts, where
 * every amount is a `number`).
 *
 * WHY THE CONVERSION LIVES ON THE PROTOTYPE
 * -----------------------------------------
 * Sequelize v6 IGNORES a `toJSON` property passed through `Model.init()` options
 * - it is not part of InitOptions, and model.js only ever defines its own
 * `toJSON` on the prototype. An earlier version of this file returned
 * `{ ...rest, toJSON() {...} }` from defineModelOptions, which silently did
 * nothing: DECIMAL values reached the API as strings such as "10.00" instead of
 * 10, so the frontend received a string where its types declare a number.
 *
 * The conversion is therefore installed as a real prototype method on BaseModel,
 * and the per-model decimal list is looked up by modelName at call time. Every
 * model extends BaseModel, so all of them inherit it.
 */

/** modelName -> camelCase DECIMAL attributes to coerce in toJSON(). */
const DECIMAL_ATTRIBUTES_BY_MODEL = new Map<string, readonly string[]>();

export interface BaseModelOptions extends InitOptions {
  /** Attribute names (camelCase) that hold DECIMAL values. */
  decimalAttributes?: string[];
}

export function defineModelOptions({ decimalAttributes = [], ...rest }: Partial<BaseModelOptions> = {}): InitOptions {
  // Registered here rather than passed to Model.init(), because Sequelize drops
  // unknown init options. Keyed by modelName so the prototype method can find it
  // without this module needing a reference to the model class.
  if (rest.modelName) {
    DECIMAL_ATTRIBUTES_BY_MODEL.set(rest.modelName, decimalAttributes);
  }
  return { ...rest } as InitOptions;
}

export abstract class BaseModel extends Model {
  declare id: string;
  declare createdAt: Date;
  declare updatedAt: Date;

  declare static readonly primaryKeyAttribute: 'id';

  /**
   * DECIMAL -> number for the API response.
   *
   * Runs on the prototype so it actually takes effect (see the note above).
   * Exactness is preserved: these are 2-dp money values, far inside
   * Number.MAX_SAFE_INTEGER, and arithmetic never uses this number form - it
   * always goes back through Decimal.js.
   */
  override toJSON(): Record<string, unknown> {
    const values = this.get({ plain: true }) as Record<string, unknown>;
    const attributes = DECIMAL_ATTRIBUTES_BY_MODEL.get(this.constructor.name) ?? [];
    for (const attribute of attributes) {
      const value = values[attribute];
      if (value !== null && value !== undefined) {
        values[attribute] = Number(value);
      }
    }
    return values;
  }
}