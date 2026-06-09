import UserManagement from '@/components/users/UserManagement';
import React from 'react';

const EmployeeToUserCreation = () => {
    return (
        <div className="min-h-screen bg-muted/30 pb-12">
            <UserManagement showBackLink={true} />
        </div>
    );
};

export default EmployeeToUserCreation;