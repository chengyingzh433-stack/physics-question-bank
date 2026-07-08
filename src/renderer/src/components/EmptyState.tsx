import { Center, Stack, Text, Button, type MantineColor } from '@mantine/core'
import { IconFileImport, type Icon } from '@tabler/icons-react'

interface EmptyStateProps {
  icon?: Icon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  color?: MantineColor
}

export function EmptyState({
  icon: Icon = IconFileImport,
  title,
  description,
  actionLabel,
  onAction,
  color = 'sky'
}: EmptyStateProps) {
  return (
    <Center h="60vh">
      <Stack align="center" gap="md">
        <Icon size={56} stroke={1.2} color={`var(--mantine-color-${color}-5)`} />
        <Text size="lg" fw={500} c="dimmed">
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" maw={400} ta="center">
            {description}
          </Text>
        )}
        {actionLabel && onAction && (
          <Button color={color} onClick={onAction} mt="xs">
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Center>
  )
}
