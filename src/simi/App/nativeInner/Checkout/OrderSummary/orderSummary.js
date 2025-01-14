import { useStyle } from '@magento/venia-ui/lib/classify';
import React from 'react';
import { FormattedMessage } from 'react-intl';
import PriceSummary from './PriceSummary';

import defaultClasses from './orderSummary.module.css';

const OrderSummary = props => {
    const classes = useStyle(defaultClasses, props.classes);
    return (
        <div className={classes.root}>
            <h1 className={classes.title}>
                <FormattedMessage
                    id={'checkoutPage.orderSummary'}
                    defaultMessage={'Order Summary'}
                />
            </h1>
            <PriceSummary isUpdating={props.isUpdating} />
        </div>
    );
};

export default OrderSummary;