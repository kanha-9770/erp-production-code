import UserCreationPage from '@/components/users/UserCreationPage';
import PageBackLink from '@/components/shared/page-back-link';
import React from 'react';

const EmployeeToUserCreation = () => {
    return (
        <main>
            <div className="px-4 pt-4 sm:px-6 lg:px-8">
                <PageBackLink href="/settings" label="Settings" />
            </div>
            <UserCreationPage/>
        </main>
    );
};

export default EmployeeToUserCreation;