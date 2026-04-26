import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

interface RadioGroupItemProps extends RadioPrimitive.Root.Props {
  /**
   * When provided, replaces the default radio dot indicator. Use for custom-styled
   * radio items such as color swatches or icon pickers.
   */
  children?: React.ReactNode;
  /**
   * When true, drops the default circular radio styling so the consumer can fully
   * control the appearance (color swatches, icon pickers, etc.). Focus ring and
   * disabled affordances are preserved.
   */
  unstyled?: boolean;
}

const ITEM_FOCUS_CLASSES =
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const ITEM_DEFAULT_CLASSES =
  "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary";

function RadioGroupItem({ className, children, unstyled, ...props }: RadioGroupItemProps) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        unstyled ? ITEM_FOCUS_CLASSES : cn(ITEM_DEFAULT_CLASSES, ITEM_FOCUS_CLASSES),
        className,
      )}
      {...props}
    >
      {children ??
        (unstyled ? null : (
          <RadioPrimitive.Indicator
            data-slot="radio-group-indicator"
            className="flex size-4 items-center justify-center"
          >
            <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
          </RadioPrimitive.Indicator>
        ))}
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
