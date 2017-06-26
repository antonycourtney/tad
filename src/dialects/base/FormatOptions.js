import NumFormatOptions from './FormatOptions/Num'
import TextFormatOptions from './FormatOptions/Text'

export type FormatOption = { type: string, getFormatter: () => ((val: ?string) => ?string) }

export {
  NumFormatOptions,
  TextFormatOptions
}
