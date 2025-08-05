import { FC } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Chip,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { makeStyles } from '@material-ui/core/styles';
import InfoOutlined from '@material-ui/icons/InfoOutlined';
import Schedule from '@material-ui/icons/Schedule';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
  },
  card: {
    textAlign: 'center',
  },
  icon: {
    fontSize: 64,
    color: theme.palette.grey[400],
    marginBottom: theme.spacing(2),
  },
  comingSoonChip: {
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
    marginTop: theme.spacing(1),
  },
}));

interface NotImplementedMessageProps {
  entityType: string;
  entityKind?: string;
  reason: string;
}

export const NotImplementedMessage: FC<NotImplementedMessageProps> = ({
  entityType,
  entityKind,
  reason,
}) => {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      <Alert severity="info" icon={<InfoOutlined />}>
        <Typography variant="h6" gutterBottom>
          VCF Operations Metrics - Coming Soon
        </Typography>
        <Typography variant="body1">
          Metrics support for <strong>{entityType}</strong>
          {entityKind && (
            <>
              {' '}of kind <strong>{entityKind}</strong>
            </>
          )} is currently being developed and will be available in an upcoming release.
        </Typography>
      </Alert>

      <Card className={classes.card} style={{ marginTop: 16 }}>
        <CardHeader
          avatar={<Schedule className={classes.icon} />}
          title="Feature In Development"
        />
        <CardContent>
          <Typography variant="body2" color="textSecondary" paragraph>
            {reason}
          </Typography>
          <Chip
            label="Coming Soon"
            className={classes.comingSoonChip}
            icon={<Schedule />}
          />
        </CardContent>
      </Card>
    </Box>
  );
};